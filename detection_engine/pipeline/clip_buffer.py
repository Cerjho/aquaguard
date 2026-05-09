"""
Clip Ring Buffer — per-camera circular buffer for drowning event clip capture.

Stores JPEG-compressed frames (default ~15 KB each) in a bounded circular
buffer.  At 30 FPS × 8 seconds = 240 slots, total memory is ~3.6 MB per
camera zone — suitable for 8 GB machines shared with YOLO inference.

Encode-on-write:
  ``write(frame)`` JPEG-encodes the raw BGR ndarray immediately.
  CPU cost is ~1–2 ms per 720p frame (same cv2.imencode path used by
  StreamServer and _atomic_write_jpeg).

Decode-on-finalize:
  ``snapshot()`` returns a copy of all buffered JPEG bytes.  The clip
  writer thread decodes them back to BGR for VideoWriter — this batch
  operation runs off the detection hot path.

Thread safety:
  Write-locked, read via atomic index — identical model to
  DashboardRingBuffer.  The snapshot bulk-copy acquires the write lock
  once (~microseconds for byte-reference copies).
"""
import logging
import threading
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from config.settings import (
    CLIP_BUFFER_SLOTS,
    CLIP_FRAME_FORMAT,
    CLIP_JPEG_QUALITY,
)

logger = logging.getLogger(__name__)


class ClipRingBuffer:
    """Circular ring buffer for drowning event clip capture.

    Thread-safe writes (lock), lock-free reads via ``latest_frame()``.
    Bulk snapshot via ``snapshot()`` for clip finalization.
    One instance per camera zone.
    """

    def __init__(
        self,
        zone_id: str,
        buffer_size: int = CLIP_BUFFER_SLOTS,
        jpeg_quality: int = CLIP_JPEG_QUALITY,
        frame_format: str = CLIP_FRAME_FORMAT,
    ):
        self.zone_id = zone_id
        self._buffer_size = max(int(buffer_size), 1)
        self._jpeg_quality = jpeg_quality
        self._use_jpeg = frame_format.strip().lower() == 'jpeg'

        # Pre-allocate slot lists (None-filled)
        self._frames: List[Optional[bytes | np.ndarray]] = [None] * self._buffer_size
        self._timestamps: List[Optional[float]] = [None] * self._buffer_size

        # Write index (only modified under lock)
        self._write_idx = 0
        self._write_lock = threading.Lock()

        # Latest frame index — updated atomically after write.
        self._latest_idx: int = -1
        self._total_writes = 0

    def write(
        self,
        frame: np.ndarray,
        timestamp: Optional[float] = None,
    ) -> None:
        """Write a frame into the ring buffer.

        If ``frame_format`` is ``'jpeg'`` (default), the frame is
        JPEG-encoded before storage to reduce memory from ~2.76 MB to
        ~15 KB per frame.  Encoding takes ~1–2 ms per 720p frame.

        Args:
            frame: BGR numpy frame from camera capture.
            timestamp: monotonic timestamp (defaults to ``time.monotonic()``).
        """
        ts = timestamp if timestamp is not None else time.monotonic()

        if self._use_jpeg:
            stored = self._encode_jpeg(frame)
            if stored is None:
                return  # Encoding failed — skip this frame, don't crash
        else:
            stored = frame  # Raw BGR reference (high memory mode)

        with self._write_lock:
            idx = self._write_idx % self._buffer_size
            self._frames[idx] = stored
            self._timestamps[idx] = ts
            self._write_idx += 1
            # Atomic-ish update for readers (Python GIL makes int assignment atomic)
            self._latest_idx = idx
            self._total_writes += 1

    def snapshot(self) -> List[Tuple[bytes | np.ndarray, float]]:
        """Return an ordered copy of all buffered frames for clip finalization.

        Acquires the write lock once to copy frame references.  At ~3.6 MB
        of JPEG bytes, this takes microseconds (reference copies, not data
        copies for JPEG mode).

        Returns:
            List of ``(frame_data, timestamp)`` tuples in chronological order.
            ``frame_data`` is JPEG bytes (if jpeg mode) or BGR ndarray (if raw).
            Empty list if no frames have been written.
        """
        with self._write_lock:
            if self._total_writes == 0:
                return []

            # Number of valid frames in the buffer
            valid_count = min(self._total_writes, self._buffer_size)

            # Start from the oldest valid frame
            if self._total_writes >= self._buffer_size:
                # Buffer has wrapped — oldest is at current write_idx
                start_idx = self._write_idx % self._buffer_size
            else:
                # Buffer not yet full — oldest is at 0
                start_idx = 0

            result = []
            for i in range(valid_count):
                idx = (start_idx + i) % self._buffer_size
                frame_data = self._frames[idx]
                ts = self._timestamps[idx]
                if frame_data is not None and ts is not None:
                    result.append((frame_data, ts))

        return result

    def latest_frame(self) -> Tuple[Optional[bytes | np.ndarray], Optional[float]]:
        """Get the most recent frame and its timestamp.

        **Never blocks** — returns ``(None, None)`` if the buffer is empty.
        """
        idx = self._latest_idx
        if idx < 0:
            return None, None

        frame = self._frames[idx]
        ts = self._timestamps[idx]

        if frame is None:
            return None, None

        return frame, ts

    def _encode_jpeg(self, frame: np.ndarray) -> Optional[bytes]:
        """Encode a BGR frame to JPEG bytes."""
        try:
            ok, buf = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality],
            )
            if ok:
                return buf.tobytes()
        except cv2.error:
            pass
        return None

    @property
    def total_writes(self) -> int:
        """Total number of frames written since creation."""
        return self._total_writes

    @property
    def is_empty(self) -> bool:
        """True if no frames have been written yet."""
        return self._latest_idx < 0

    @property
    def buffer_size(self) -> int:
        """Maximum number of frames the buffer can hold."""
        return self._buffer_size
