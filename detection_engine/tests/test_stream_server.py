"""
Unit tests for V2: In-memory MJPEG StreamServer.

Covers:
- StreamServer start/stop lifecycle
- /health endpoint returns zone info
- /frame/<zone_id> returns JPEG snapshot
- /stream/<zone_id> serves MJPEG frames
- 404 for unknown zone
- Hot-add zone registration
"""
import json
import time
import urllib.request
import urllib.error

import numpy as np
import pytest

from detection_engine.pipeline.dashboard_buffer import DashboardRingBuffer
from detection_engine.stream_server import StreamServer

_TEST_PORT = 18765


def _make_frame(value: int = 128, h: int = 480, w: int = 640) -> np.ndarray:
    """Create a BGR frame."""
    return np.full((h, w, 3), value, dtype=np.uint8)


@pytest.fixture(scope="module")
def shared_server():
    """Start a single StreamServer for all tests in this module."""
    buf1 = DashboardRingBuffer("pool-1")
    buf2 = DashboardRingBuffer("pool-2")
    buf1.write(_make_frame(100), 1.0)
    buf2.write(_make_frame(200), 2.0)
    buffers = {"pool-1": buf1, "pool-2": buf2}

    srv = StreamServer(
        dashboard_buffers=buffers,
        host="127.0.0.1",
        port=_TEST_PORT,
    )
    srv.start()
    time.sleep(0.5)  # Give server time to bind
    yield srv
    srv.stop()


class TestStreamServerLifecycle:
    """Server start/stop."""

    def test_url_property(self):
        srv = StreamServer(
            dashboard_buffers={}, host="0.0.0.0", port=9999,
        )
        assert srv.url == "http://0.0.0.0:9999"

    def test_port_property(self):
        srv = StreamServer(dashboard_buffers={}, port=12345)
        assert srv.port == 12345


class TestHealthEndpoint:
    """GET /health"""

    def test_health_returns_zone_info(self, shared_server):
        resp = urllib.request.urlopen(f"{shared_server.url}/health")
        data = json.loads(resp.read())
        assert data["status"] == "ok"
        assert "pool-1" in data["zones"]
        assert "pool-2" in data["zones"]
        assert data["zones"]["pool-1"]["has_frame"] is True
        assert data["zones"]["pool-1"]["total_writes"] >= 1


class TestSnapshotEndpoint:
    """GET /frame/<zone_id>"""

    def test_snapshot_returns_jpeg(self, shared_server):
        resp = urllib.request.urlopen(f"{shared_server.url}/frame/pool-1")
        assert resp.status == 200
        assert resp.headers["Content-Type"] == "image/jpeg"
        data = resp.read()
        # JPEG magic bytes
        assert data[:2] == b'\xff\xd8'

    def test_snapshot_404_for_unknown_zone(self, shared_server):
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(f"{shared_server.url}/frame/nonexistent")
        assert exc_info.value.code == 404


class TestMJPEGStream:
    """GET /stream/<zone_id>"""

    def test_stream_returns_multipart_header(self, shared_server):
        """Stream endpoint returns multipart content type with JPEG data."""
        import socket

        sock = socket.create_connection(("127.0.0.1", _TEST_PORT), timeout=3)
        try:
            sock.sendall(b"GET /stream/pool-1 HTTP/1.0\r\n\r\n")
            # Read response headers + start of body
            data = b""
            while len(data) < 4096:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                data += chunk
                # Stop once we've seen a JPEG boundary
                if b"image/jpeg" in data:
                    break

            header_text = data.decode("latin-1", errors="replace")
            assert "multipart/x-mixed-replace" in header_text
            assert "image/jpeg" in header_text
        finally:
            sock.close()

    def test_stream_404_for_unknown_zone(self, shared_server):
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(f"{shared_server.url}/stream/nonexistent")
        assert exc_info.value.code == 404


class TestRegisterZone:
    """Hot-add zone support."""

    def test_register_zone_adds_buffer(self, shared_server):
        new_buf = DashboardRingBuffer("pool-3")
        new_buf.write(_make_frame(150), 3.0)
        shared_server.register_zone("pool-3", new_buf)

        resp = urllib.request.urlopen(f"{shared_server.url}/frame/pool-3")
        assert resp.status == 200
        assert resp.headers["Content-Type"] == "image/jpeg"
