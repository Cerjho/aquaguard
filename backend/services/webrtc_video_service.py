"""WebRTC video service — SnapshotVideoTrack and zone frame cache.

This module owns the optional aiortc/cv2/PIL import blocks, the
per-zone frame cache, and the SnapshotVideoTrack class that reads
live frames from the detection engine's in-memory stream server
and serves them as a WebRTC video stream.

Frame source: GET http://detection_engine:8765/frame/{zone_id}
This reads from the same DashboardRingBuffer that MJPEG uses,
ensuring WebRTC delivers full-FPS video identical to MJPEG.

Falls back to disk-based reads if the stream server is unavailable.
"""

import asyncio
import io
import logging
import os
import time

import requests as http_requests

LOGGER = logging.getLogger(__name__)

# ── Optional runtime dependencies ─────────────────────────────────────────────

try:
    from aiortc import (
        RTCPeerConnection,
        RTCSessionDescription,
        RTCConfiguration,
        RTCIceServer,
        VideoStreamTrack,
    )
    from aiortc.sdp import candidate_from_sdp
    from av import VideoFrame

    AIORTC_AVAILABLE = True
    AIORTC_IMPORT_ERROR = None
except ImportError as exc:
    RTCPeerConnection = None
    RTCSessionDescription = None
    RTCConfiguration = None
    RTCIceServer = None
    VideoStreamTrack = None
    candidate_from_sdp = None
    VideoFrame = None
    AIORTC_AVAILABLE = False
    AIORTC_IMPORT_ERROR = str(exc)

try:
    import cv2
    import numpy as np

    _CV2_DECODER_AVAILABLE = True
except ImportError:
    cv2 = None
    np = None
    _CV2_DECODER_AVAILABLE = False

try:
    from PIL import Image

    _PIL_DECODER_AVAILABLE = True
except ImportError:
    Image = None
    _PIL_DECODER_AVAILABLE = False


# ── Stream server URL ────────────────────────────────────────────────────────

_STREAM_SERVER_BASE = os.environ.get(
    'STREAM_SERVER_URL',
    f'http://127.0.0.1:{os.environ.get("STREAM_SERVER_PORT", "8765")}',
)

# ── Disk fallback directory ──────────────────────────────────────────────────

LIVE_SNAPSHOT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'snapshots',
    'live',
)


# ── Zone frame cache ──────────────────────────────────────────────────────────

# Keyed by zone_id. Each entry: {'frame': <decoded image>, 'timestamp': float}
_ZONE_FRAME_CACHE: dict = {}
# Per-zone asyncio locks to prevent concurrent reads for the same zone
_ZONE_CACHE_LOCKS: dict = {}

# Persistent HTTP session for stream server requests (connection pooling)
_HTTP_SESSION = http_requests.Session()
_HTTP_SESSION.headers.update({'Connection': 'keep-alive'})


# ── SnapshotVideoTrack ────────────────────────────────────────────────────────

if AIORTC_AVAILABLE:
    class SnapshotVideoTrack(VideoStreamTrack):
        """WebRTC video track that serves live frames at ~30 fps.

        Primary source: detection engine's in-memory stream server
        (GET /frame/{zone_id}), which reads from the same ring buffer
        as the MJPEG path — ensuring identical full-FPS video.

        Falls back to disk-based JPEG reads if the stream server is
        unreachable.
        """

        def __init__(self, zone_id):
            super().__init__()
            self.zone_id = zone_id
            self._cached_frame = None
            self._frame_timestamp = 0
            self._cache_interval = 0.033  # ~30 fps
            self._stream_server_url = f'{_STREAM_SERVER_BASE}/frame/{zone_id}'
            self._use_stream_server = True  # Try stream server first
            self._last_server_retry = 0

        async def _read_latest_frame_async(self):
            zone_id = self.zone_id
            if zone_id not in _ZONE_CACHE_LOCKS:
                _ZONE_CACHE_LOCKS[zone_id] = asyncio.Lock()

            async with _ZONE_CACHE_LOCKS[zone_id]:
                cache = _ZONE_FRAME_CACHE.get(zone_id, {'frame': None, 'timestamp': 0})
                now = time.time()
                # Serve cached frame if younger than ~33 ms (30 fps)
                if now - cache['timestamp'] < self._cache_interval:
                    self._cached_frame = cache['frame']
                    self._frame_timestamp = cache['timestamp']
                    return cache['frame']

                loop = asyncio.get_event_loop()
                frame = None

                # Primary: fetch from in-memory stream server
                if self._use_stream_server:
                    try:
                        frame = await loop.run_in_executor(
                            None, self._fetch_from_stream_server
                        )
                    except Exception:
                        # Stream server down — fall back to disk
                        self._use_stream_server = False
                        self._last_server_retry = now
                        LOGGER.debug(
                            'Stream server unavailable for zone %s, '
                            'falling back to disk reads',
                            zone_id,
                        )

                # Fallback: read from disk
                if frame is None:
                    frame_path = os.path.join(
                        LIVE_SNAPSHOT_DIR, f'{self.zone_id}_latest.jpg'
                    )
                    try:
                        frame = await loop.run_in_executor(
                            None, self._safe_read_jpeg, frame_path
                        )
                    except Exception as exc:
                        LOGGER.warning(
                            'WebRTC frame read failed for zone %s: %s',
                            self.zone_id, exc,
                        )

                    # Periodically retry stream server (every 10s)
                    if not self._use_stream_server and now - self._last_server_retry > 10:
                        self._use_stream_server = True

                if frame is not None:
                    _ZONE_FRAME_CACHE[zone_id] = {'frame': frame, 'timestamp': time.time()}
                    self._cached_frame = frame
                    self._frame_timestamp = _ZONE_FRAME_CACHE[zone_id]['timestamp']
                    return frame

                # Update timestamp on failure to avoid spamming I/O
                if cache['timestamp'] == 0:
                    _ZONE_FRAME_CACHE[zone_id] = {'frame': None, 'timestamp': time.time()}

                return self._cached_frame

        def _fetch_from_stream_server(self):
            """Fetch a single JPEG frame from the stream server and decode it."""
            resp = _HTTP_SESSION.get(self._stream_server_url, timeout=1)
            if resp.status_code != 200:
                return None

            data = resp.content
            if len(data) < 4:
                return None

            if _CV2_DECODER_AVAILABLE:
                arr = np.frombuffer(data, dtype=np.uint8)
                return cv2.imdecode(arr, cv2.IMREAD_COLOR)

            if _PIL_DECODER_AVAILABLE:
                with Image.open(io.BytesIO(data)) as image:
                    return image.convert('RGB')

            return None

        def _safe_read_jpeg(self, path):
            """Read JPEG from disk with validation (fallback path)."""
            try:
                with open(path, 'rb') as f:
                    data = f.read()

                if len(data) < 4:
                    return None
                if data[:2] != b'\xff\xd8':   # SOI marker
                    return None
                if data[-2:] != b'\xff\xd9':  # EOI marker
                    return None

                if _CV2_DECODER_AVAILABLE:
                    arr = np.frombuffer(data, dtype=np.uint8)
                    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

                if _PIL_DECODER_AVAILABLE:
                    with Image.open(io.BytesIO(data)) as image:
                        return image.convert('RGB')

                return None
            except (IOError, OSError):
                return None

        def _build_black_frame(self):
            if _CV2_DECODER_AVAILABLE:
                black = np.zeros((480, 640, 3), dtype=np.uint8)
                return VideoFrame.from_ndarray(black, format='bgr24')

            if _PIL_DECODER_AVAILABLE:
                image = Image.new('RGB', (640, 480), color=(0, 0, 0))
                return VideoFrame.from_image(image)

            return VideoFrame(width=640, height=480, format='rgb24')

        async def recv(self):
            pts, time_base = await self.next_timestamp()

            # Refresh frame if cache is stale
            now = time.time()
            if now - self._frame_timestamp > self._cache_interval:
                await self._read_latest_frame_async()

            frame = self._cached_frame
            if frame is None:
                video_frame = self._build_black_frame()
            elif _CV2_DECODER_AVAILABLE and isinstance(frame, np.ndarray):
                video_frame = VideoFrame.from_ndarray(frame, format='bgr24')
            elif _PIL_DECODER_AVAILABLE and isinstance(frame, Image.Image):
                video_frame = VideoFrame.from_image(frame)
            else:
                video_frame = self._build_black_frame()

            video_frame.pts = pts
            video_frame.time_base = time_base
            return video_frame

else:
    # Stub so that 'from services.webrtc_video_service import SnapshotVideoTrack'
    # always succeeds regardless of aiortc availability.
    class SnapshotVideoTrack:  # noqa: F811
        """Stub used when aiortc is not installed."""
        def __init__(self, zone_id):
            raise RuntimeError('aiortc is not available — WebRTC streaming is disabled')
