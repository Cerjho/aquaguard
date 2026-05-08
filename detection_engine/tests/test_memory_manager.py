"""
Unit tests for Phase 2: Adaptive GPU memory pressure management.

Covers:
- GPUMemorySnapshot.utilization property
- Memory pressure tier transitions (NORMAL → WARNING → CRITICAL → EMERGENCY)
- Adaptive cache clear interval adjustment
- Emergency cleanup behavior (GC + double clear)
- on_pressure_change callback invocation
- Existing test compatibility preserved
"""
from unittest.mock import Mock, patch, call

import pytest

import detection_engine.memory_manager as memory_manager
from detection_engine.memory_manager import (
    GPUMemoryManager,
    GPUMemorySnapshot,
    MemoryPressureTier,
)


def _mock_cuda(
    available: bool = True,
    free_mb: float = 512,
    total_mb: float = 1024,
    allocated_mb: float = 128,
    reserved_mb: float = 256,
    peak_mb: float = 300,
) -> Mock:
    """Create a mock torch.cuda with configurable memory stats."""
    cuda = Mock()
    cuda.is_available.return_value = available
    cuda.empty_cache = Mock()
    cuda.reset_peak_memory_stats = Mock()
    cuda.set_per_process_memory_fraction = Mock()
    cuda.mem_get_info.return_value = (
        int(free_mb * 1024 * 1024),
        int(total_mb * 1024 * 1024),
    )
    cuda.memory_allocated.return_value = int(allocated_mb * 1024 * 1024)
    cuda.memory_reserved.return_value = int(reserved_mb * 1024 * 1024)
    cuda.max_memory_allocated.return_value = int(peak_mb * 1024 * 1024)
    cuda.synchronize = Mock()
    return cuda


# ═══════════════════════════════════════════════════════════════════════════════
# GPUMemorySnapshot Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestGPUMemorySnapshot:
    """GPUMemorySnapshot utilization property."""

    def test_utilization_normal(self):
        """Utilization calculated correctly."""
        snap = GPUMemorySnapshot(
            allocated_mb=200, reserved_mb=300, peak_allocated_mb=350,
            free_mb=500, total_mb=1000,
        )
        assert abs(snap.utilization - 0.5) < 0.01

    def test_utilization_zero_total(self):
        """Utilization is 0.0 when total is 0 (no GPU)."""
        snap = GPUMemorySnapshot(0, 0, 0, 0, 0)
        assert snap.utilization == 0.0

    def test_utilization_high(self):
        """Utilization is high when free is low."""
        snap = GPUMemorySnapshot(
            allocated_mb=900, reserved_mb=950, peak_allocated_mb=960,
            free_mb=50, total_mb=1000,
        )
        assert snap.utilization >= 0.95


# ═══════════════════════════════════════════════════════════════════════════════
# Existing Tests (backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════


class TestGPUMemoryManagerBackwardCompat:
    """Existing tests must still pass."""

    def test_rejects_invalid_configuration(self):
        with pytest.raises(ValueError):
            GPUMemoryManager(0.0, 5)
        with pytest.raises(ValueError):
            GPUMemoryManager(0.75, 0)

    def test_initialize_sets_cuda_fraction(self, monkeypatch):
        cuda = _mock_cuda(available=True)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(memory_fraction=0.6, cache_clear_interval_frames=3)

        assert mgr.initialize() is True
        cuda.set_per_process_memory_fraction.assert_called_once_with(0.6)
        cuda.empty_cache.assert_called_once()
        cuda.reset_peak_memory_stats.assert_called_once()

    def test_record_inference_complete_clears_cache_on_interval(self, monkeypatch):
        cuda = _mock_cuda(available=True)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(memory_fraction=0.75, cache_clear_interval_frames=3)

        mgr.initialize()
        cuda.empty_cache.reset_mock()
        cuda.reset_peak_memory_stats.reset_mock()

        mgr.record_inference_complete()
        mgr.record_inference_complete()
        cuda.empty_cache.assert_not_called()

        mgr.record_inference_complete()
        cuda.empty_cache.assert_called_once()

    def test_snapshot_and_cleanup_handle_unavailable_cuda(self, monkeypatch):
        cuda = _mock_cuda(available=False)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(memory_fraction=0.75, cache_clear_interval_frames=3)

        snapshot = mgr.snapshot()
        assert snapshot.allocated_mb == 0.0
        assert snapshot.utilization == 0.0

        mgr.cleanup()
        cuda.empty_cache.assert_not_called()
        cuda.synchronize.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: Memory Pressure Tier Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestMemoryPressureTiers:
    """Adaptive memory pressure tier transitions."""

    def test_initial_tier_is_normal(self):
        mgr = GPUMemoryManager(0.75, 15)
        assert mgr.pressure_tier == MemoryPressureTier.NORMAL

    def test_transition_to_warning(self, monkeypatch):
        """Tier transitions to WARNING when utilization >= 70%."""
        # 75% utilization: free=250/1000
        cuda = _mock_cuda(free_mb=250, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.WARNING

    def test_transition_to_critical(self, monkeypatch):
        """Tier transitions to CRITICAL when utilization >= 85%."""
        # 88% utilization: free=120/1000
        cuda = _mock_cuda(free_mb=120, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.CRITICAL

    def test_transition_to_emergency(self, monkeypatch):
        """Tier transitions to EMERGENCY when utilization >= 92%."""
        # 95% utilization: free=50/1000
        cuda = _mock_cuda(free_mb=50, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.EMERGENCY

    def test_transition_back_to_normal(self, monkeypatch):
        """Tier returns to NORMAL when utilization drops."""
        cuda = _mock_cuda(free_mb=50, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.EMERGENCY

        # Memory recovered
        cuda.mem_get_info.return_value = (800 * 1024 * 1024, 1000 * 1024 * 1024)
        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.NORMAL


class TestAdaptiveClearInterval:
    """Cache clear interval adapts to pressure tier."""

    def test_normal_uses_default_interval(self, monkeypatch):
        cuda = _mock_cuda(free_mb=800, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr._active_clear_interval == 15  # Default

    def test_warning_reduces_interval(self, monkeypatch):
        cuda = _mock_cuda(free_mb=250, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr._active_clear_interval == 5  # WARNING interval

    def test_critical_clears_every_frame(self, monkeypatch):
        cuda = _mock_cuda(free_mb=100, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert mgr._active_clear_interval == 1  # CRITICAL interval


class TestEmergencyCleanup:
    """Emergency OOM prevention behavior."""

    def test_emergency_triggers_gc_and_sync(self, monkeypatch):
        cuda = _mock_cuda(free_mb=50, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        cuda.empty_cache.reset_mock()
        mgr._evaluate_memory_pressure()

        assert mgr.pressure_tier == MemoryPressureTier.EMERGENCY
        assert mgr.emergency_count == 1
        # empty_cache called multiple times (regular + emergency double-clear)
        assert cuda.empty_cache.call_count >= 2
        cuda.synchronize.assert_called()

    def test_emergency_count_increments(self, monkeypatch):
        cuda = _mock_cuda(free_mb=50, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
        mgr = GPUMemoryManager(0.75, 15)
        mgr.initialize()

        # Force EMERGENCY, then back, then EMERGENCY again
        mgr._evaluate_memory_pressure()
        assert mgr.emergency_count == 1

        cuda.mem_get_info.return_value = (800 * 1024 * 1024, 1000 * 1024 * 1024)
        mgr._evaluate_memory_pressure()  # Back to NORMAL

        cuda.mem_get_info.return_value = (50 * 1024 * 1024, 1000 * 1024 * 1024)
        mgr._evaluate_memory_pressure()
        assert mgr.emergency_count == 2


class TestPressureChangeCallback:
    """on_pressure_change callback fires on tier transitions."""

    def test_callback_fires_on_transition(self, monkeypatch):
        cuda = _mock_cuda(free_mb=250, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)

        transitions = []

        def on_change(old, new, util):
            transitions.append((old, new, round(util, 2)))

        mgr = GPUMemoryManager(0.75, 15, on_pressure_change=on_change)
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        assert len(transitions) == 1
        assert transitions[0][0] == MemoryPressureTier.NORMAL
        assert transitions[0][1] == MemoryPressureTier.WARNING

    def test_callback_not_fired_when_tier_unchanged(self, monkeypatch):
        cuda = _mock_cuda(free_mb=250, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)

        transitions = []
        mgr = GPUMemoryManager(
            0.75, 15,
            on_pressure_change=lambda o, n, u: transitions.append(1),
        )
        mgr.initialize()

        mgr._evaluate_memory_pressure()
        mgr._evaluate_memory_pressure()  # Same tier
        assert len(transitions) == 1  # Only one transition

    def test_callback_exception_does_not_crash(self, monkeypatch):
        cuda = _mock_cuda(free_mb=250, total_mb=1000)
        monkeypatch.setattr(memory_manager.torch, "cuda", cuda)

        def bad_callback(o, n, u):
            raise RuntimeError("callback error")

        mgr = GPUMemoryManager(0.75, 15, on_pressure_change=bad_callback)
        mgr.initialize()

        # Should not raise
        mgr._evaluate_memory_pressure()
        assert mgr.pressure_tier == MemoryPressureTier.WARNING
