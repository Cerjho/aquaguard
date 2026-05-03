"""Regression tests for detection_engine.memory_manager."""

from unittest.mock import Mock

import pytest

import detection_engine.memory_manager as memory_manager


def _mock_cuda(available: bool = True) -> Mock:
    cuda = Mock()
    cuda.is_available.return_value = available
    cuda.empty_cache = Mock()
    cuda.reset_peak_memory_stats = Mock()
    cuda.set_per_process_memory_fraction = Mock()
    cuda.mem_get_info.return_value = (512 * 1024 * 1024, 1024 * 1024 * 1024)
    cuda.memory_allocated.return_value = 128 * 1024 * 1024
    cuda.memory_reserved.return_value = 256 * 1024 * 1024
    cuda.max_memory_allocated.return_value = 300 * 1024 * 1024
    cuda.synchronize = Mock()
    return cuda


def test_gpu_memory_manager_rejects_invalid_configuration():
    with pytest.raises(ValueError):
        memory_manager.GPUMemoryManager(0.0, 5)
    with pytest.raises(ValueError):
        memory_manager.GPUMemoryManager(0.75, 0)


def test_initialize_sets_cuda_fraction(monkeypatch):
    cuda = _mock_cuda(available=True)
    monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
    manager = memory_manager.GPUMemoryManager(
        memory_fraction=0.6,
        cache_clear_interval_frames=3,
    )

    assert manager.initialize() is True
    cuda.set_per_process_memory_fraction.assert_called_once_with(0.6)
    cuda.empty_cache.assert_called_once()
    cuda.reset_peak_memory_stats.assert_called_once()


def test_record_inference_complete_clears_cache_on_interval(monkeypatch):
    cuda = _mock_cuda(available=True)
    monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
    manager = memory_manager.GPUMemoryManager(
        memory_fraction=0.75,
        cache_clear_interval_frames=3,
    )

    manager.initialize()
    cuda.empty_cache.reset_mock()
    cuda.reset_peak_memory_stats.reset_mock()

    manager.record_inference_complete()
    manager.record_inference_complete()
    cuda.empty_cache.assert_not_called()
    cuda.reset_peak_memory_stats.assert_not_called()

    manager.record_inference_complete()
    cuda.empty_cache.assert_called_once()
    cuda.reset_peak_memory_stats.assert_called_once()


def test_snapshot_and_cleanup_handle_unavailable_cuda(monkeypatch):
    cuda = _mock_cuda(available=False)
    monkeypatch.setattr(memory_manager.torch, "cuda", cuda)
    manager = memory_manager.GPUMemoryManager(
        memory_fraction=0.75,
        cache_clear_interval_frames=3,
    )

    snapshot = manager.snapshot()
    assert snapshot.allocated_mb == 0.0
    assert snapshot.reserved_mb == 0.0
    assert snapshot.peak_allocated_mb == 0.0
    assert snapshot.free_mb == 0.0
    assert snapshot.total_mb == 0.0

    manager.cleanup()
    cuda.empty_cache.assert_not_called()
    cuda.synchronize.assert_not_called()
