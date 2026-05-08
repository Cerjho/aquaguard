"""
Dashboard Ring Buffer — per-camera circular buffer for live streaming.

Provides a lock-free read path for the dashboard stream endpoint:
- ``write(frame, timestamp)`` is thread-safe (acquires write lock)
- ``latest_frame()`` never blocks — returns the most recent frame or None
- 60-slot circular buffer per camera zone
- Used by the stream lane (Task 3) to decouple dashboard FPS from detection

This replaces the disk-based ContinuousFrameWriter for the dashboard path.
"""
import logging
import threading
import time
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_BUFFER_SIZE = 60


class DashboardRingBuffer:
    """
    Circular ring buffer for dashboard live streaming frames.

    Thread-safe writes (lock), lock-free reads via ``latest_frame()``.
    One instance per camera zone.

    The buffer stores frame references — NOT copies.  The feeder thread
    passes the same decoded frame reference to both detection and dashboard
    branches (no copy).  Because the dashboard only ever reads the *latest*
    frame and the feeder writes atomically under lock, this is safe.
    """

    def __init__(
        self,
        zone_id: str,
        buffer_size: int = _DEFAULT_BUFFER_SIZE,
    ):
        self.zone_id = zone_id
        self._buffer_size = buffer_size

        # Pre-allocate slot list (None-filled)
        self._frames: list[Optional[np.ndarray]] = [None] * buffer_size
        self._timestamps: list[Optional[float]] = [None] * buffer_size

        # Write index (only modified under lock)
        self._write_idx = 0
        self._write_lock = threading.Lock()

        # Latest frame index — updated atomically after write.
        # Readers see either the old or new value, both valid.
        self._latest_idx: int = -1
        self._total_writes = 0

    def write(
        self,
        frame: np.ndarray,
        timestamp: Optional[float] = None,
    ) -> None:
        """
        Write a frame into the ring buffer.

        Thread-safe.  Never blocks the caller for more than the time to
        set two list slots + increment an index.

        Args:
            frame: BGR numpy frame from RTSP decode.
            timestamp: monotonic timestamp (defaults to time.monotonic()).
        """
        ts = timestamp if timestamp is not None else time.monotonic()

        with self._write_lock:
            idx = self._write_idx % self._buffer_size
            self._frames[idx] = frame
            self._timestamps[idx] = ts
            self._write_idx += 1
            # Atomic-ish update for readers (Python GIL makes int assignment atomic)
            self._latest_idx = idx
            self._total_writes += 1

    def latest_frame(self) -> Tuple[Optional[np.ndarray], Optional[float]]:
        """
        Get the most recent frame and its timestamp.

        **Never blocks** — returns ``(None, None)`` if the buffer is empty.

        Returns:
            ``(frame, timestamp)`` tuple.  ``frame`` is a numpy BGR array,
            ``timestamp`` is a monotonic float.
        """
        idx = self._latest_idx
        if idx < 0:
            return None, None

        frame = self._frames[idx]
        ts = self._timestamps[idx]

        if frame is None:
            return None, None

        return frame, ts

    @property
    def total_writes(self) -> int:
        """Total number of frames written since creation."""
        return self._total_writes

    @property
    def is_empty(self) -> bool:
        """True if no frames have been written yet."""
        return self._latest_idx < 0
