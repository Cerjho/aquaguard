"""WebRTC video service — SnapshotVideoTrack and zone frame cache.

This module owns the optional aiortc/cv2/PIL import blocks, the
per-zone frame cache, and the SnapshotVideoTrack class that reads
live JPEG snapshots and serves them as a WebRTC video stream.

Extracted from routes/webrtc.py to keep the route file focused on
HTTP/WebSocket signalling, not media pipeline concerns.
"""

import asyncio
import io
import logging
import os
import time

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


# ── Snapshot directory ────────────────────────────────────────────────────────

LIVE_SNAPSHOT_DIR = os.path.join(
    # Resolves to: <project_root>/backend/snapshots/live
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'snapshots',
    'live',
)


# ── Zone frame cache ──────────────────────────────────────────────────────────

# Keyed by zone_id. Each entry: {'frame': <decoded image>, 'timestamp': float}
_ZONE_FRAME_CACHE: dict = {}
# Per-zone asyncio locks to prevent concurrent JPEG reads for the same zone
_ZONE_CACHE_LOCKS: dict = {}


# ── SnapshotVideoTrack ────────────────────────────────────────────────────────

if AIORTC_AVAILABLE:
    class SnapshotVideoTrack(VideoStreamTrack):
        """WebRTC video track that serves live JPEG snapshots at ~30 fps.

        Reads the latest JPEG snapshot from disk, decodes it with OpenCV
        or Pillow, and serves it as a VideoFrame. Falls back to a black
        frame when no snapshot is available.
        """

        def __init__(self, zone_id):
            super().__init__()
            self.zone_id = zone_id
            self._cached_frame = None
            self._frame_timestamp = 0
            self._cache_interval = 0.033  # ~30 fps

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
                frame_path = os.path.join(LIVE_SNAPSHOT_DIR, f'{self.zone_id}_latest.jpg')
                try:
                    # Run I/O in thread pool to avoid blocking the event loop
                    frame = await loop.run_in_executor(None, self._safe_read_jpeg, frame_path)
                    if frame is not None:
                        _ZONE_FRAME_CACHE[zone_id] = {'frame': frame, 'timestamp': time.time()}
                        self._cached_frame = frame
                        self._frame_timestamp = _ZONE_FRAME_CACHE[zone_id]['timestamp']
                        return frame
                except Exception as exc:
                    LOGGER.warning('WebRTC frame read failed for zone %s: %s', self.zone_id, exc)

                # Update timestamp on failure to avoid spamming disk I/O
                if cache['timestamp'] == 0:
                    _ZONE_FRAME_CACHE[zone_id] = {'frame': None, 'timestamp': time.time()}

                return self._cached_frame

        def _safe_read_jpeg(self, path):
            """Read JPEG with validation to avoid corrupted frames."""
            try:
                # Read file bytes first to avoid partial reads
                with open(path, 'rb') as f:
                    data = f.read()

                # Validate JPEG markers (SOI at start, EOI at end)
                if len(data) < 4:
                    return None
                if data[:2] != b'\xff\xd8':   # SOI marker
                    return None
                if data[-2:] != b'\xff\xd9':  # EOI marker
                    return None

                if _CV2_DECODER_AVAILABLE:
                    # Decode with OpenCV when available
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
