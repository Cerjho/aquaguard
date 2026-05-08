"""
Unit tests for Phase 0: PriorityFrameQueue, backpressure, DashboardRingBuffer.

Covers:
- PriorityFrameQueue: CRITICAL never dropped, LOW eviction, HIGH eviction,
  queue_depth() accuracy, eviction_callback, backward-compat put/get
- DetectionWorker backpressure: tier transitions, frame skipping
- DashboardRingBuffer: write/read, never-block guarantee, empty buffer
"""
import threading
import time

import numpy as np
import pytest

from detection_engine.pipeline.frame_queue import (
    AnnotatedFrameQueue,
    FrameData,
    FramePriority,
    FrameQueue,
    PriorityFrameQueue,
)
from detection_engine.pipeline.dashboard_buffer import DashboardRingBuffer
from detection_engine.pipeline.detection_worker import (
    BackpressureTier,
    DetectionWorker,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_frame(value: int = 128, h: int = 480, w: int = 640) -> np.ndarray:
    """Create a BGR frame filled with a single value (non-zero, non-uniform)."""
    frame = np.full((h, w, 3), value, dtype=np.uint8)
    # Add some variance so motion scoring doesn't reject it
    frame[0, 0, 0] = min(value + 10, 255)
    return frame


def _make_moving_frame(seed: int, h: int = 480, w: int = 640) -> np.ndarray:
    """Create a frame with unique content to trigger motion scoring."""
    rng = np.random.RandomState(seed)
    return rng.randint(0, 255, (h, w, 3), dtype=np.uint8)


# ═══════════════════════════════════════════════════════════════════════════════
# PriorityFrameQueue Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestPriorityFrameQueueBasic:
    """Basic put/get and backward compatibility."""

    def test_backward_compat_alias(self):
        """FrameQueue is an alias for PriorityFrameQueue."""
        assert FrameQueue is PriorityFrameQueue

    def test_put_get_basic(self):
        """put() and get() work with backward-compatible signatures."""
        q = PriorityFrameQueue("zone-1")
        frame = _make_frame()
        q.put(frame, "2025-01-01T00:00:00Z")
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.timestamp == "2025-01-01T00:00:00Z"
        assert result.frame is not None

    def test_get_timeout_returns_none(self):
        """get() returns None when queue is empty and timeout expires."""
        q = PriorityFrameQueue("zone-1")
        result = q.get(timeout=0.05)
        assert result is None

    def test_queue_depth_empty(self):
        """queue_depth() returns 0.0 on empty queue."""
        q = PriorityFrameQueue("zone-1")
        assert q.queue_depth() == 0.0

    def test_queue_depth_accuracy(self):
        """queue_depth() returns correct fraction of max depth."""
        q = PriorityFrameQueue("zone-1", max_depth=10)
        # Put 5 HIGH frames (use put_with_priority to control priority)
        for i in range(5):
            q.put_with_priority(
                _make_frame(100 + i), f"ts-{i}", FramePriority.HIGH,
            )
        assert abs(q.queue_depth() - 0.5) < 0.01

    def test_queue_depth_full(self):
        """queue_depth() returns 1.0 when queue is full."""
        q = PriorityFrameQueue("zone-1", max_depth=5)
        for i in range(5):
            q.put_with_priority(
                _make_frame(100 + i), f"ts-{i}", FramePriority.HIGH,
            )
        assert abs(q.queue_depth() - 1.0) < 0.01

    def test_clear(self):
        """clear() empties the queue."""
        q = PriorityFrameQueue("zone-1")
        q.put_with_priority(_make_frame(), "ts", FramePriority.HIGH)
        q.clear()
        assert q.queue_depth() == 0.0
        assert q.get(timeout=0.01) is None

    def test_stats_keys(self):
        """stats property returns expected keys."""
        q = PriorityFrameQueue("zone-1")
        stats = q.stats
        expected_keys = {
            'frames_received', 'frames_dropped', 'frames_processed',
            'drop_rate', 'drop_rate_cumulative', 'queue_size', 'queue_depth',
        }
        assert expected_keys.issubset(set(stats.keys()))


class TestPriorityFrameQueueCritical:
    """CRITICAL frames are never dropped."""

    def test_critical_never_dropped_when_queue_has_room(self):
        """CRITICAL frames enqueue normally when queue has space."""
        q = PriorityFrameQueue("zone-1", max_depth=5)
        q.put_with_priority(_make_frame(), "ts", FramePriority.CRITICAL)
        assert q.queue_depth() > 0
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.priority == FramePriority.CRITICAL

    def test_critical_evicts_low_when_full(self):
        """CRITICAL frame evicts LOW frame when queue is full."""
        q = PriorityFrameQueue("zone-1", max_depth=3)
        # Fill with LOW + HIGH
        q.put_with_priority(_make_frame(10), "low", FramePriority.LOW)
        q.put_with_priority(_make_frame(20), "high1", FramePriority.HIGH)
        q.put_with_priority(_make_frame(30), "high2", FramePriority.HIGH)
        assert abs(q.queue_depth() - 1.0) < 0.01

        # Push CRITICAL — should evict the LOW
        q.put_with_priority(_make_frame(40), "critical", FramePriority.CRITICAL)
        # Queue should still be full (3/3)
        assert abs(q.queue_depth() - 1.0) < 0.01

        # Get all — CRITICAL should be first (highest priority)
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.priority == FramePriority.CRITICAL

    def test_critical_evicts_high_when_no_low(self):
        """CRITICAL evicts oldest HIGH when no LOW frames available."""
        q = PriorityFrameQueue("zone-1", max_depth=2)
        q.put_with_priority(_make_frame(10), "h1", FramePriority.HIGH)
        q.put_with_priority(_make_frame(20), "h2", FramePriority.HIGH)

        # Push CRITICAL — evicts oldest HIGH
        q.put_with_priority(_make_frame(30), "crit", FramePriority.CRITICAL)

        result = q.get(timeout=1.0)
        assert result.priority == FramePriority.CRITICAL

    def test_critical_blocks_when_all_critical(self):
        """CRITICAL blocks up to 100ms when queue full of CRITICALs."""
        q = PriorityFrameQueue("zone-1", max_depth=2)
        q.put_with_priority(_make_frame(10), "c1", FramePriority.CRITICAL)
        q.put_with_priority(_make_frame(20), "c2", FramePriority.CRITICAL)

        # This should NOT raise — logs CRITICAL warning and continues
        start = time.monotonic()
        q.put_with_priority(_make_frame(30), "c3", FramePriority.CRITICAL)
        elapsed = time.monotonic() - start
        # Should have waited ~100ms
        assert elapsed >= 0.05  # at least 50ms (generous tolerance)


class TestPriorityFrameQueueHighEviction:
    """HIGH frame eviction when queue is full."""

    def test_high_evicts_oldest_high(self):
        """New HIGH frame evicts the oldest HIGH when queue is full."""
        q = PriorityFrameQueue("zone-1", max_depth=3)
        q.put_with_priority(_make_frame(10), "h1", FramePriority.HIGH)
        q.put_with_priority(_make_frame(20), "h2", FramePriority.HIGH)
        q.put_with_priority(_make_frame(30), "h3", FramePriority.HIGH)

        # Push another HIGH — should evict h1 (oldest)
        q.put_with_priority(_make_frame(40), "h4", FramePriority.HIGH)
        assert abs(q.queue_depth() - 1.0) < 0.01

        # First out should be h2 (h1 was evicted)
        result = q.get(timeout=1.0)
        assert result.timestamp == "h2"

    def test_high_dropped_when_no_high_to_evict(self):
        """HIGH frame is dropped when queue is full of CRITICAL only."""
        q = PriorityFrameQueue("zone-1", max_depth=2)
        q.put_with_priority(_make_frame(10), "c1", FramePriority.CRITICAL)
        q.put_with_priority(_make_frame(20), "c2", FramePriority.CRITICAL)

        # Push HIGH — should be dropped (no HIGH to evict)
        q.put_with_priority(_make_frame(30), "h1", FramePriority.HIGH)
        # Queue should still be 2/2
        assert abs(q.queue_depth() - 1.0) < 0.01
        assert q.stats['frames_dropped'] >= 1


class TestPriorityFrameQueueLowEviction:
    """LOW frames: only the latest is kept."""

    def test_low_replaces_previous_low(self):
        """New LOW frame replaces existing LOW frame."""
        q = PriorityFrameQueue("zone-1", max_depth=10)
        q.put_with_priority(_make_frame(10), "low1", FramePriority.LOW)
        q.put_with_priority(_make_frame(20), "low2", FramePriority.LOW)

        # Should only have 1 frame (low2 replaced low1)
        depth = q.queue_depth()
        assert abs(depth - 0.1) < 0.01  # 1/10

        result = q.get(timeout=1.0)
        assert result.timestamp == "low2"

    def test_low_dropped_when_queue_full_no_room(self):
        """LOW frame dropped when queue full and no LOW to replace."""
        q = PriorityFrameQueue("zone-1", max_depth=2)
        q.put_with_priority(_make_frame(10), "h1", FramePriority.HIGH)
        q.put_with_priority(_make_frame(20), "h2", FramePriority.HIGH)

        # Push LOW — queue full of HIGH, LOW is dropped
        q.put_with_priority(_make_frame(30), "low1", FramePriority.LOW)
        assert q.stats['frames_dropped'] >= 1


class TestEvictionCallback:
    """eviction_callback fires correctly on eviction."""

    def test_callback_fires_on_low_eviction(self):
        """eviction_callback called when LOW frame is evicted."""
        evictions = []

        def on_evict(priority, frame_data, reason):
            evictions.append((priority, frame_data.timestamp, reason))

        q = PriorityFrameQueue(
            "zone-1", max_depth=10, eviction_callback=on_evict,
        )
        q.put_with_priority(_make_frame(10), "low1", FramePriority.LOW)
        q.put_with_priority(_make_frame(20), "low2", FramePriority.LOW)

        assert len(evictions) == 1
        assert evictions[0][0] == FramePriority.LOW
        assert evictions[0][1] == "low1"
        assert "newer_low" in evictions[0][2]

    def test_callback_fires_on_high_eviction(self):
        """eviction_callback called when HIGH frame is evicted."""
        evictions = []

        def on_evict(priority, frame_data, reason):
            evictions.append((priority, frame_data.timestamp, reason))

        q = PriorityFrameQueue(
            "zone-1", max_depth=2, eviction_callback=on_evict,
        )
        q.put_with_priority(_make_frame(10), "h1", FramePriority.HIGH)
        q.put_with_priority(_make_frame(20), "h2", FramePriority.HIGH)
        q.put_with_priority(_make_frame(30), "h3", FramePriority.HIGH)

        assert len(evictions) == 1
        assert evictions[0][0] == FramePriority.HIGH
        assert evictions[0][1] == "h1"  # oldest HIGH evicted

    def test_callback_fires_on_critical_eviction(self):
        """eviction_callback called when a frame is evicted to make room for CRITICAL."""
        evictions = []

        def on_evict(priority, frame_data, reason):
            evictions.append((priority, frame_data.timestamp, reason))

        q = PriorityFrameQueue(
            "zone-1", max_depth=2, eviction_callback=on_evict,
        )
        q.put_with_priority(_make_frame(10), "low1", FramePriority.LOW)
        q.put_with_priority(_make_frame(20), "h1", FramePriority.HIGH)

        # Push CRITICAL — should evict LOW
        q.put_with_priority(_make_frame(30), "crit", FramePriority.CRITICAL)

        assert len(evictions) == 1
        assert evictions[0][1] == "low1"
        assert "critical" in evictions[0][2]


class TestPriorityOrdering:
    """Frames are dequeued in priority order (CRITICAL first)."""

    def test_priority_ordering(self):
        """CRITICAL frames come out before HIGH, which come before LOW."""
        q = PriorityFrameQueue("zone-1", max_depth=10)
        q.put_with_priority(_make_frame(10), "low", FramePriority.LOW)
        q.put_with_priority(_make_frame(20), "high", FramePriority.HIGH)
        q.put_with_priority(_make_frame(30), "critical", FramePriority.CRITICAL)

        r1 = q.get(timeout=1.0)
        r2 = q.get(timeout=1.0)
        r3 = q.get(timeout=1.0)

        assert r1.priority == FramePriority.CRITICAL
        assert r2.priority == FramePriority.HIGH
        assert r3.priority == FramePriority.LOW


class TestMotionScoring:
    """Motion-based auto-priority via put()."""

    def test_first_frame_is_low(self):
        """First frame always gets LOW priority (no previous frame)."""
        q = PriorityFrameQueue("zone-1")
        q.put(_make_frame(128), "ts1")
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.priority == FramePriority.LOW

    def test_high_motion_frame(self):
        """Frame with significant motion gets HIGH priority."""
        q = PriorityFrameQueue("zone-1")
        # First frame (baseline)
        q.put(_make_frame(128), "ts1")
        q.get(timeout=1.0)

        # Second frame — dramatically different
        q.put(_make_moving_frame(42), "ts2")
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.priority in (FramePriority.HIGH, FramePriority.CRITICAL)

    def test_active_detection_makes_critical(self):
        """set_active_detection(True) forces CRITICAL priority."""
        q = PriorityFrameQueue("zone-1")
        q.set_active_detection(True)
        q.put(_make_frame(128), "ts1")
        result = q.get(timeout=1.0)
        assert result is not None
        assert result.priority == FramePriority.CRITICAL


# ═══════════════════════════════════════════════════════════════════════════════
# DashboardRingBuffer Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestDashboardRingBuffer:
    """DashboardRingBuffer circular buffer tests."""

    def test_empty_buffer_returns_none(self):
        """latest_frame() returns (None, None) on empty buffer."""
        buf = DashboardRingBuffer("zone-1")
        frame, ts = buf.latest_frame()
        assert frame is None
        assert ts is None

    def test_is_empty_initial(self):
        """is_empty is True before any writes."""
        buf = DashboardRingBuffer("zone-1")
        assert buf.is_empty is True

    def test_write_read(self):
        """Write a frame, read it back."""
        buf = DashboardRingBuffer("zone-1")
        frame = _make_frame()
        buf.write(frame, 1000.0)
        result_frame, result_ts = buf.latest_frame()
        assert result_frame is not None
        assert result_ts == 1000.0
        assert buf.is_empty is False

    def test_latest_frame_returns_most_recent(self):
        """latest_frame() always returns the most recently written frame."""
        buf = DashboardRingBuffer("zone-1", buffer_size=5)
        for i in range(10):
            buf.write(_make_frame(100 + i), float(i))

        frame, ts = buf.latest_frame()
        assert ts == 9.0
        assert buf.total_writes == 10

    def test_latest_frame_never_blocks(self):
        """latest_frame() completes in <1ms even under concurrent writes."""
        buf = DashboardRingBuffer("zone-1")

        # Start writer thread
        stop = threading.Event()

        def writer():
            i = 0
            while not stop.is_set():
                buf.write(_make_frame(i % 255), float(i))
                i += 1

        t = threading.Thread(target=writer, daemon=True)
        t.start()
        time.sleep(0.1)  # Let writer run

        # Read should complete instantly
        start = time.monotonic()
        for _ in range(100):
            buf.latest_frame()
        elapsed = time.monotonic() - start

        stop.set()
        t.join(timeout=1.0)

        # 100 reads should take well under 100ms
        assert elapsed < 0.1

    def test_circular_wrap(self):
        """Buffer wraps correctly when exceeding buffer_size."""
        buf = DashboardRingBuffer("zone-1", buffer_size=3)
        for i in range(10):
            buf.write(_make_frame(i % 255), float(i))

        frame, ts = buf.latest_frame()
        assert ts == 9.0
        assert buf.total_writes == 10


# ═══════════════════════════════════════════════════════════════════════════════
# Backpressure Tier Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestBackpressureTier:
    """DetectionWorker backpressure tier transitions."""

    def _make_worker(self, queue_depth_value: float = 0.0):
        """Create a DetectionWorker with mocked dependencies."""
        from unittest.mock import MagicMock

        input_queue = MagicMock(spec=PriorityFrameQueue)
        input_queue.queue_depth.return_value = queue_depth_value
        input_queue.stats = {
            'drop_rate': 0.0,
            'frames_received': 0,
            'frames_dropped': 0,
            'frames_processed': 0,
        }

        output_queue = MagicMock(spec=AnnotatedFrameQueue)
        detector = MagicMock()
        pose_estimator = MagicMock()
        behavior_analyzer = MagicMock()
        confidence_filter = MagicMock()
        annotate_fn = MagicMock(return_value=_make_frame())
        gpu_mm = MagicMock()
        gpu_mm.initialize = MagicMock()

        worker = DetectionWorker(
            zone_id="zone-test",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=detector,
            pose_estimator=pose_estimator,
            behavior_analyzer=behavior_analyzer,
            confidence_filter=confidence_filter,
            annotate_frame_fn=annotate_fn,
            gpu_memory_manager=gpu_mm,
        )
        return worker, input_queue

    def test_initial_tier_is_normal(self):
        """Worker starts in NORMAL tier."""
        worker, _ = self._make_worker()
        assert worker._backpressure_tier == BackpressureTier.NORMAL

    def test_transition_to_pressure(self):
        """Tier transitions to PRESSURE when depth >= 0.5."""
        worker, q = self._make_worker(0.6)
        worker._update_backpressure_tier()
        assert worker._backpressure_tier == BackpressureTier.PRESSURE

    def test_transition_to_overload(self):
        """Tier transitions to OVERLOAD when depth >= 0.8."""
        worker, q = self._make_worker(0.85)
        worker._update_backpressure_tier()
        assert worker._backpressure_tier == BackpressureTier.OVERLOAD

    def test_transition_back_to_normal(self):
        """Tier transitions back to NORMAL when depth drops."""
        worker, q = self._make_worker(0.9)
        worker._update_backpressure_tier()
        assert worker._backpressure_tier == BackpressureTier.OVERLOAD

        q.queue_depth.return_value = 0.1
        worker._update_backpressure_tier()
        assert worker._backpressure_tier == BackpressureTier.NORMAL

    def test_skip_low_in_pressure(self):
        """LOW frames are skipped in PRESSURE tier."""
        worker, _ = self._make_worker(0.6)
        worker._update_backpressure_tier()

        frame_data = FrameData(
            frame=_make_frame(), timestamp="ts",
            priority=FramePriority.LOW,
        )
        assert worker._should_skip_frame(frame_data) is True

    def test_keep_high_in_pressure(self):
        """HIGH frames are kept in PRESSURE tier."""
        worker, _ = self._make_worker(0.6)
        worker._update_backpressure_tier()

        frame_data = FrameData(
            frame=_make_frame(), timestamp="ts",
            priority=FramePriority.HIGH,
        )
        assert worker._should_skip_frame(frame_data) is False

    def test_keep_critical_in_overload(self):
        """CRITICAL frames are kept in OVERLOAD tier."""
        worker, _ = self._make_worker(0.9)
        worker._update_backpressure_tier()

        frame_data = FrameData(
            frame=_make_frame(), timestamp="ts",
            priority=FramePriority.CRITICAL,
        )
        assert worker._should_skip_frame(frame_data) is False

    def test_skip_low_in_overload(self):
        """LOW frames are skipped in OVERLOAD tier."""
        worker, _ = self._make_worker(0.9)
        worker._update_backpressure_tier()

        frame_data = FrameData(
            frame=_make_frame(), timestamp="ts",
            priority=FramePriority.LOW,
        )
        assert worker._should_skip_frame(frame_data) is True

    def test_imgsz_override_normal(self):
        """No imgsz override in NORMAL tier."""
        worker, _ = self._make_worker(0.1)
        worker._update_backpressure_tier()
        assert worker._get_imgsz_override() is None

    def test_imgsz_override_pressure(self):
        """imgsz=960 in PRESSURE tier."""
        worker, _ = self._make_worker(0.6)
        worker._update_backpressure_tier()
        assert worker._get_imgsz_override() == 960

    def test_imgsz_override_overload(self):
        """imgsz=640 in OVERLOAD tier."""
        worker, _ = self._make_worker(0.9)
        worker._update_backpressure_tier()
        assert worker._get_imgsz_override() == 640


# ═══════════════════════════════════════════════════════════════════════════════
# Thread Safety Smoke Test
# ═══════════════════════════════════════════════════════════════════════════════


class TestThreadSafety:
    """Concurrent put/get doesn't crash or deadlock."""

    def test_concurrent_put_get(self):
        """Multiple writers and one reader don't crash."""
        q = PriorityFrameQueue("zone-1", max_depth=10)
        stop = threading.Event()
        errors = []

        def writer(priority):
            try:
                for i in range(50):
                    if stop.is_set():
                        break
                    q.put_with_priority(
                        _make_frame(i % 255), f"ts-{i}",
                        FramePriority(priority),
                    )
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        def reader():
            try:
                for _ in range(100):
                    if stop.is_set():
                        break
                    q.get(timeout=0.01)
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=writer, args=(FramePriority.CRITICAL,)),
            threading.Thread(target=writer, args=(FramePriority.HIGH,)),
            threading.Thread(target=writer, args=(FramePriority.LOW,)),
            threading.Thread(target=reader),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)
        stop.set()

        assert len(errors) == 0, f"Thread errors: {errors}"
