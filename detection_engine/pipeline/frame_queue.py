"""
Thread-safe frame queue for the multi-threaded detection pipeline.

This implements the "table" between workers in the Three-Lane Highway:
- Camera thread puts raw frames on the queue
- Detection thread picks frames from the queue
- Only the LATEST frame matters (older frames are dropped)
"""
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class FrameData:
    """Container for a frame and its metadata."""
    frame: np.ndarray
    timestamp: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    detections: Optional[list] = None  # Filled by detection worker
    annotated_frame: Optional[np.ndarray] = None  # Filled by detection worker


class FrameQueue:
    """
    Thread-safe single-slot frame queue (latest frame only).

    This is NOT a traditional FIFO queue — it always holds only the LATEST frame.
    This ensures the AI always processes the most recent frame, not stale ones.

    Three-Lane Highway Pattern:
    - Worker 1 (Cameraman): Calls put() at 30 FPS
    - Worker 2 (AI Brain): Calls get() whenever ready (10-15 FPS)
    - Worker 3 (Streamer): Reads from frame_writer separately
    """

    def __init__(self, zone_id: str):
        self.zone_id = zone_id
        self._frame_data: Optional[FrameData] = None
        self._lock = threading.Lock()
        self._new_frame_event = threading.Event()

        # Cumulative stats
        self._frames_received = 0
        self._frames_dropped = 0
        self._frames_processed = 0

        # Windowed stats (rolling 30-second window)
        self._window_received = 0
        self._window_dropped = 0
        self._window_processed = 0
        self._window_start = time.monotonic()
        self._window_duration = 30.0

    def put(self, frame: np.ndarray, timestamp: str, metadata: Optional[Dict] = None) -> None:
        """
        Put a new frame (replaces any existing frame).

        Called by the camera capture thread at camera FPS (e.g., 30 FPS).
        Non-blocking — never waits.
        """
        with self._lock:
            self._maybe_reset_window()

            if self._frame_data is not None:
                self._frames_dropped += 1
                self._window_dropped += 1

            self._frame_data = FrameData(
                frame=frame,
                timestamp=timestamp,
                metadata=metadata or {},
            )
            self._frames_received += 1
            self._window_received += 1
            self._new_frame_event.set()

    def get(self, timeout: Optional[float] = None) -> Optional[FrameData]:
        """
        Get the latest frame (removes it from the queue).

        Called by the detection worker thread.
        Blocks until a frame is available or timeout expires.

        Returns:
            FrameData if available, None if timeout expired.
        """
        if not self._new_frame_event.wait(timeout=timeout):
            return None  # Timeout

        with self._lock:
            frame_data = self._frame_data
            self._frame_data = None
            self._new_frame_event.clear()

            if frame_data is not None:
                self._frames_processed += 1
                self._window_processed += 1

            return frame_data

    def peek(self) -> Optional[FrameData]:
        """
        Peek at the latest frame without removing it.

        Useful for the frame writer to get raw frames.
        """
        with self._lock:
            return self._frame_data

    def _maybe_reset_window(self) -> None:
        """Reset windowed counters if the window has elapsed. Caller holds lock."""
        now = time.monotonic()
        if now - self._window_start >= self._window_duration:
            self._window_received = 0
            self._window_dropped = 0
            self._window_processed = 0
            self._window_start = now

    @property
    def stats(self) -> Dict[str, int]:
        """Get queue statistics.

        ``drop_rate`` reflects the last 30-second window so it responds
        quickly to changes.  ``drop_rate_cumulative`` tracks all-time.
        """
        with self._lock:
            self._maybe_reset_window()
            return {
                'frames_received': self._frames_received,
                'frames_dropped': self._frames_dropped,
                'frames_processed': self._frames_processed,
                'drop_rate': (
                    self._window_dropped / self._window_received
                    if self._window_received > 0 else 0.0
                ),
                'drop_rate_cumulative': (
                    self._frames_dropped / self._frames_received
                    if self._frames_received > 0 else 0.0
                ),
            }

    def clear(self) -> None:
        """Clear the queue."""
        with self._lock:
            self._frame_data = None
            self._new_frame_event.clear()


class AnnotatedFrameQueue:
    """
    Thread-safe queue for annotated (detection-processed) frames.

    Detection worker puts annotated frames here.
    Frame writer reads from here for streaming.
    """

    def __init__(self, zone_id: str):
        self.zone_id = zone_id
        self._frame_data: Optional[FrameData] = None
        self._lock = threading.Lock()

    def put(self, frame_data: FrameData) -> None:
        """Put annotated frame data."""
        with self._lock:
            self._frame_data = frame_data

    def get(self) -> Optional[FrameData]:
        """Get the latest annotated frame (non-blocking, consume-on-read)."""
        with self._lock:
            frame_data = self._frame_data
            self._frame_data = None
            return frame_data
