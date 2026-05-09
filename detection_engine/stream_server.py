"""
In-memory MJPEG stream server — serves live camera frames over HTTP.

Reads directly from the DashboardRingBuffer (P0-Task 3) and JPEG-encodes
on demand.  No disk I/O.  No file locks.  No `os.path.getmtime()` polling.

Eliminates V2: disk-based frame serving replaced by in-memory HTTP streaming.

The server runs on a configurable internal port (default 8765) and serves:
  GET /stream/<zone_id>  → multipart/x-mixed-replace MJPEG stream
  GET /frame/<zone_id>   → single JPEG snapshot
  GET /health            → JSON health check
"""
import json
import logging
import os
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Optional

import cv2
import numpy as np

from config.settings import LIVE_SNAPSHOT_JPEG_QUALITY

logger = logging.getLogger(__name__)

_DEFAULT_PORT = int(os.environ.get("STREAM_SERVER_PORT", "8765"))
_DEFAULT_HOST = os.environ.get("STREAM_SERVER_HOST", "0.0.0.0")
_STREAM_FPS = 30
_BOUNDARY = b"aquaguard_frame"


class _StreamRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler for MJPEG streaming."""

    # Suppress default access logging (we log ourselves)
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        path = self.path.rstrip("/")

        if path.startswith("/stream/"):
            zone_id = path[len("/stream/"):]
            self._handle_stream(zone_id)
        elif path.startswith("/frame/"):
            zone_id = path[len("/frame/"):]
            self._handle_snapshot(zone_id)
        elif path == "/health":
            self._handle_health()
        else:
            self.send_error(404, "Not Found")

    def _handle_stream(self, zone_id: str) -> None:
        """Serve continuous MJPEG stream for a zone."""
        buffers = self.server.dashboard_buffers
        if zone_id not in buffers:
            self.send_error(404, f"Zone '{zone_id}' not found")
            return

        buf = buffers[zone_id]
        quality = self.server.jpeg_quality
        frame_interval = 1.0 / _STREAM_FPS

        self.send_response(200)
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={_BOUNDARY.decode()}")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        last_ts = None
        try:
            while True:
                frame, ts = buf.latest_frame()
                if frame is not None and ts != last_ts:
                    jpeg_bytes = self._encode_jpeg(frame, quality)
                    if jpeg_bytes is not None:
                        self.wfile.write(b"--" + _BOUNDARY + b"\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg_bytes)}\r\n".encode())
                        self.wfile.write(b"\r\n")
                        self.wfile.write(jpeg_bytes)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                        last_ts = ts
                time.sleep(frame_interval)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Client disconnected — normal for stream endpoints
            pass

    def _handle_snapshot(self, zone_id: str) -> None:
        """Serve a single JPEG snapshot for a zone."""
        buffers = self.server.dashboard_buffers
        if zone_id not in buffers:
            self.send_error(404, f"Zone '{zone_id}' not found")
            return

        buf = buffers[zone_id]
        frame, ts = buf.latest_frame()

        if frame is None:
            self.send_error(503, "No frame available")
            return

        jpeg_bytes = self._encode_jpeg(frame, self.server.jpeg_quality)
        if jpeg_bytes is None:
            self.send_error(500, "JPEG encoding failed")
            return

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg_bytes)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(jpeg_bytes)

    def _handle_health(self) -> None:
        """Return health status with zone info."""
        buffers = self.server.dashboard_buffers
        zones = {}
        for zone_id, buf in buffers.items():
            _, ts = buf.latest_frame()
            zones[zone_id] = {
                "has_frame": ts is not None,
                "total_writes": buf.total_writes,
                "is_empty": buf.is_empty,
            }

        body = json.dumps({
            "status": "ok",
            "zones": zones,
            "server": "aquaguard-stream-server",
        }).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def _encode_jpeg(frame: np.ndarray, quality: int) -> Optional[bytes]:
        """Encode a BGR frame to JPEG bytes."""
        try:
            ok, buf = cv2.imencode(
                ".jpg", frame,
                [cv2.IMWRITE_JPEG_QUALITY, quality],
            )
            if ok:
                return buf.tobytes()
        except cv2.error:
            pass
        return None


class _ReusableHTTPServer(HTTPServer):
    """HTTPServer with SO_REUSEADDR set before bind."""
    allow_reuse_address = True


class StreamServer:
    """In-memory MJPEG stream server.

    Reads from DashboardRingBuffer instances (one per zone) and serves
    MJPEG streams over HTTP.  Completely eliminates disk I/O for streaming.

    Usage:
        server = StreamServer(
            dashboard_buffers={"zone-1": ring_buffer},
            host="0.0.0.0",
            port=8765,
        )
        server.start()   # Non-blocking (runs in daemon thread)
        server.stop()
    """

    def __init__(
        self,
        dashboard_buffers: Dict,
        host: str = _DEFAULT_HOST,
        port: int = _DEFAULT_PORT,
        jpeg_quality: int = LIVE_SNAPSHOT_JPEG_QUALITY,
    ):
        self._host = host
        self._port = port
        self._dashboard_buffers = dashboard_buffers
        self._jpeg_quality = jpeg_quality
        self._httpd: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        """Start the stream server in a background daemon thread."""
        try:
            self._httpd = _ReusableHTTPServer(
                (self._host, self._port),
                _StreamRequestHandler,
            )
        except OSError as exc:
            logger.error(
                "Stream server failed to bind %s:%d: %s",
                self._host, self._port, exc,
            )
            return

        # Attach data to server instance so handler can access it
        self._httpd.dashboard_buffers = self._dashboard_buffers
        self._httpd.jpeg_quality = self._jpeg_quality

        self._thread = threading.Thread(
            target=self._serve_with_logging,
            name="stream-server",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "Stream server started on %s:%d (%d zones)",
            self._host, self._port, len(self._dashboard_buffers),
        )

    def _serve_with_logging(self) -> None:
        """Wrapper around serve_forever that logs crashes."""
        try:
            self._httpd.serve_forever()
        except Exception as exc:
            logger.error("Stream server crashed: %s", exc, exc_info=True)

    def register_zone(self, zone_id: str, buffer) -> None:
        """Register a new zone's DashboardRingBuffer (hot-add)."""
        self._dashboard_buffers[zone_id] = buffer

    def stop(self) -> None:
        """Shutdown the stream server."""
        if self._httpd is not None:
            self._httpd.shutdown()
            logger.info("Stream server stopped")

    @property
    def port(self) -> int:
        """Return the port the server is listening on."""
        return self._port

    @property
    def url(self) -> str:
        """Return the base URL of the server."""
        # 0.0.0.0 means "all interfaces" but isn't browsable
        display_host = "127.0.0.1" if self._host == "0.0.0.0" else self._host
        return f"http://{display_host}:{self._port}"
