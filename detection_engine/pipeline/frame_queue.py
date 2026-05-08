"""
Priority-aware frame queue for the multi-threaded detection pipeline.

Replaces the original single-slot FrameQueue with a priority queue that:
- Supports three priority levels: CRITICAL, HIGH, LOW
- Uses motion scoring to classify frames (<1ms per frame)
- Applies per-priority drop policies (CRITICAL never dropped)
- Provides queue_depth() for backpressure signaling

The ``put()`` / ``get()`` interface is backward-compatible — existing
callers work unchanged.  Use ``put_with_priority()`` to override the
auto-computed priority.
"""
import enum
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Constants (not hardcoded — named here for clarity) ──────────────────────
_MAX_QUEUE_DEPTH = 10
_MOTION_DOWNSAMPLE_SIZE = (320, 240)
_MOTION_PIXEL_DIFF_THRESHOLD = 25
_MOTION_SCORE_HIGH_THRESHOLD = 0.02
_CRITICAL_PUT_TIMEOUT_SECONDS = 0.100  # 100 ms


class FramePriority(enum.IntEnum):
    """Frame priority levels.  Lower value = higher priority."""
    CRITICAL = 0
    HIGH = 1
    LOW = 2


@dataclass
class FrameData:
    """Container for a frame and its metadata."""
    frame: np.ndarray
    timestamp: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    detections: Optional[list] = None      # Filled by detection worker
    annotated_frame: Optional[np.ndarray] = None  # Filled by detection worker
    priority: int = FramePriority.LOW      # Set by motion scoring


class PriorityFrameQueue:
    """
    Thread-safe priority frame queue with motion-aware triage.

    Max depth: 10 frames.  Three priority tiers:
    - CRITICAL (0): Never dropped.  Blocks with 100 ms timeout on full queue.
    - HIGH (1): Evicts oldest HIGH frame when queue is full.
    - LOW (2): Only the latest LOW frame is kept — previous LOWs discarded.

    Backward-compatible ``put(frame, timestamp, metadata)`` performs automatic
    motion scoring.  ``put_with_priority()`` allows explicit override.
    """

    def __init__(
        self,
        zone_id: str,
        max_depth: int = _MAX_QUEUE_DEPTH,
        eviction_callback: Optional[
            Callable[[int, "FrameData", str], None]
        ] = None,
    ):
        self.zone_id = zone_id
        self._max_depth = max_depth
        self._eviction_callback = eviction_callback

        # Internal storage: list of (priority, seq, FrameData) sorted manually
        self._queue: List[Tuple[int, int, FrameData]] = []
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self._sequence = 0

        # Motion scoring state
        self._prev_gray: Optional[np.ndarray] = None

        # Flag: an active detection exists in this zone → next frames CRITICAL
        self._active_detection = False

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

    # ── Public: backward-compatible interface ────────────────────────────────

    def put(
        self,
        frame: np.ndarray,
        timestamp: str,
        metadata: Optional[Dict] = None,
    ) -> None:
        """
        Put a new frame with auto-computed priority.

        Called by the camera capture thread at camera FPS.
        Replaces the old single-slot ``put()``.
        """
        priority = self._compute_priority(frame)
        frame_data = FrameData(
            frame=frame,
            timestamp=timestamp,
            metadata=metadata or {},
            priority=priority,
        )
        self._enqueue(frame_data, FramePriority(priority))

    def get(self, timeout: Optional[float] = None) -> Optional[FrameData]:
        """
        Get the highest-priority frame (removes it from the queue).

        Blocks until a frame is available or *timeout* expires.

        Returns:
            FrameData if available, None on timeout.
        """
        with self._not_empty:
            if not self._queue:
                self._not_empty.wait(timeout=timeout)
            if not self._queue:
                return None  # Timeout or spurious wake

            self._maybe_reset_window()

            # Pop the highest-priority item (lowest (priority, seq) tuple)
            self._queue.sort(key=lambda item: (item[0], item[1]))
            _, _, frame_data = self._queue.pop(0)

            self._frames_processed += 1
            self._window_processed += 1
            return frame_data

    def put_with_priority(
        self,
        frame: np.ndarray,
        timestamp: str,
        priority: FramePriority,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Enqueue a frame with an explicit priority override."""
        frame_data = FrameData(
            frame=frame,
            timestamp=timestamp,
            metadata=metadata or {},
            priority=int(priority),
        )
        self._enqueue(frame_data, priority)

    def queue_depth(self) -> float:
        """Current queue depth as a fraction of max (0.0–1.0)."""
        with self._lock:
            return len(self._queue) / self._max_depth

    def set_active_detection(self, active: bool) -> None:
        """Signal that an active drowning detection exists in this zone."""
        self._active_detection = active

    # ── Stats & management ───────────────────────────────────────────────────

    def peek(self) -> Optional[FrameData]:
        """Peek at the highest-priority frame without removing it."""
        with self._lock:
            if not self._queue:
                return None
            self._queue.sort(key=lambda item: (item[0], item[1]))
            return self._queue[0][2]

    @property
    def stats(self) -> Dict[str, Any]:
        """Queue statistics compatible with old FrameQueue.stats."""
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
                'queue_size': len(self._queue),
                'queue_depth': len(self._queue) / self._max_depth,
            }

    def clear(self) -> None:
        """Clear the queue."""
        with self._lock:
            self._queue.clear()

    # ── Internal ─────────────────────────────────────────────────────────────

    def _enqueue(
        self, frame_data: FrameData, priority: FramePriority,
    ) -> None:
        """Insert *frame_data* respecting per-priority drop policies."""
        with self._not_empty:
            self._maybe_reset_window()
            self._frames_received += 1
            self._window_received += 1

            seq = self._sequence
            self._sequence += 1

            if priority == FramePriority.LOW:
                self._enqueue_low(frame_data, seq)
            elif priority == FramePriority.HIGH:
                self._enqueue_high(frame_data, seq)
            else:
                self._enqueue_critical(frame_data, seq)

            self._not_empty.notify()

    def _enqueue_low(
        self, frame_data: FrameData, seq: int,
    ) -> None:
        """Keep only 1 LOW frame (the latest).  Caller holds lock."""
        # Evict existing LOW frames
        evicted = [
            entry for entry in self._queue
            if entry[0] == FramePriority.LOW
        ]
        for entry in evicted:
            self._queue.remove(entry)
            self._frames_dropped += 1
            self._window_dropped += 1
            self._fire_eviction(
                FramePriority.LOW, entry[2], "newer_low_arrived",
            )

        # If queue is still full after LOW eviction, drop this frame
        if len(self._queue) >= self._max_depth:
            self._frames_dropped += 1
            self._window_dropped += 1
            self._fire_eviction(
                FramePriority.LOW, frame_data, "queue_full_low_dropped",
            )
            return

        self._queue.append((FramePriority.LOW, seq, frame_data))

    def _enqueue_high(
        self, frame_data: FrameData, seq: int,
    ) -> None:
        """Enqueue normally; evict oldest HIGH if full.  Caller holds lock."""
        if len(self._queue) >= self._max_depth:
            # Find oldest HIGH frame (smallest seq among HIGH entries)
            high_entries = [
                (i, entry) for i, entry in enumerate(self._queue)
                if entry[0] == FramePriority.HIGH
            ]
            if high_entries:
                # Sort by sequence number to find oldest
                high_entries.sort(key=lambda x: x[1][1])
                oldest_idx = high_entries[0][0]
                evicted_entry = self._queue.pop(oldest_idx)
                self._frames_dropped += 1
                self._window_dropped += 1
                self._fire_eviction(
                    FramePriority.HIGH, evicted_entry[2],
                    "oldest_high_evicted",
                )
            else:
                # No HIGH frames to evict — queue full of CRITICAL, drop this
                self._frames_dropped += 1
                self._window_dropped += 1
                self._fire_eviction(
                    FramePriority.HIGH, frame_data,
                    "queue_full_no_high_to_evict",
                )
                return

        self._queue.append((FramePriority.HIGH, seq, frame_data))

    def _enqueue_critical(
        self, frame_data: FrameData, seq: int,
    ) -> None:
        """CRITICAL frames are never dropped.  Blocks 100 ms on full queue.
        Caller holds lock (Condition)."""
        if len(self._queue) < self._max_depth:
            self._queue.append(
                (FramePriority.CRITICAL, seq, frame_data),
            )
            return

        # Queue full — try to make room by evicting lowest-priority frame
        # Prefer evicting LOW, then HIGH
        evict_idx = self._find_evictable_index()
        if evict_idx is not None:
            evicted_entry = self._queue.pop(evict_idx)
            self._frames_dropped += 1
            self._window_dropped += 1
            self._fire_eviction(
                evicted_entry[0], evicted_entry[2],
                "evicted_for_critical",
            )
            self._queue.append(
                (FramePriority.CRITICAL, seq, frame_data),
            )
            return

        # Queue full of CRITICAL — wait up to 100 ms
        deadline = time.monotonic() + _CRITICAL_PUT_TIMEOUT_SECONDS
        while len(self._queue) >= self._max_depth:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.critical(
                    "[%s] CRITICAL frame blocked for 100ms, "
                    "queue still full (seq=%d). Continuing without enqueue.",
                    self.zone_id, seq,
                )
                return  # Do NOT raise — never crash the feeder
            self._not_empty.wait(timeout=remaining)

        self._queue.append(
            (FramePriority.CRITICAL, seq, frame_data),
        )

    def _find_evictable_index(self) -> Optional[int]:
        """Find the best frame to evict: prefer LOW, then oldest HIGH.
        Caller holds lock."""
        # Prefer LOW frames
        for i, entry in enumerate(self._queue):
            if entry[0] == FramePriority.LOW:
                return i

        # Then oldest HIGH
        high_entries = [
            (i, entry) for i, entry in enumerate(self._queue)
            if entry[0] == FramePriority.HIGH
        ]
        if high_entries:
            high_entries.sort(key=lambda x: x[1][1])
            return high_entries[0][0]

        return None  # All CRITICAL

    def _compute_priority(self, frame: np.ndarray) -> int:
        """Compute frame priority from motion score.  Target: <1 ms."""
        # If an active drowning detection exists → CRITICAL
        if self._active_detection:
            return FramePriority.CRITICAL

        try:
            # Downsample + grayscale
            small = cv2.resize(
                frame, _MOTION_DOWNSAMPLE_SIZE,
                interpolation=cv2.INTER_NEAREST,
            )
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            if self._prev_gray is None:
                self._prev_gray = gray
                return FramePriority.LOW

            # Absolute difference
            diff = cv2.absdiff(gray, self._prev_gray)
            self._prev_gray = gray

            changed = np.count_nonzero(
                diff > _MOTION_PIXEL_DIFF_THRESHOLD,
            )
            total = gray.shape[0] * gray.shape[1]
            motion_score = changed / total

            if motion_score > _MOTION_SCORE_HIGH_THRESHOLD:
                return FramePriority.HIGH
            return FramePriority.LOW

        except Exception:
            # If motion scoring fails, default to HIGH (safe fallback)
            return FramePriority.HIGH

    def _fire_eviction(
        self,
        priority: int,
        frame_data: FrameData,
        reason: str,
    ) -> None:
        """Call eviction callback if registered.  Caller holds lock."""
        if self._eviction_callback is not None:
            try:
                self._eviction_callback(priority, frame_data, reason)
            except Exception as exc:
                logger.warning(
                    "[%s] eviction_callback error: %s",
                    self.zone_id, exc,
                )

    def _maybe_reset_window(self) -> None:
        """Reset windowed counters if the window has elapsed.  Caller holds lock."""
        now = time.monotonic()
        if now - self._window_start >= self._window_duration:
            self._window_received = 0
            self._window_dropped = 0
            self._window_processed = 0
            self._window_start = now


# ── Backward-compatible alias ────────────────────────────────────────────────
FrameQueue = PriorityFrameQueue


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
