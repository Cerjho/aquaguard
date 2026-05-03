"""GPU memory management utilities for continuous detection inference."""

from __future__ import annotations

import atexit
import logging
import threading
from dataclasses import dataclass

import torch

from config.settings import (
    DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES,
    DETECTION_GPU_MEMORY_FRACTION,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GPUMemorySnapshot:
    """Normalized GPU memory snapshot in MB."""

    allocated_mb: float
    reserved_mb: float
    peak_allocated_mb: float
    free_mb: float
    total_mb: float


class GPUMemoryManager:
    """Manage CUDA memory lifecycle for long-running inference loops."""

    def __init__(
        self,
        memory_fraction: float,
        cache_clear_interval_frames: int,
    ) -> None:
        if not 0 < memory_fraction <= 1:
            raise ValueError("memory_fraction must be in range (0, 1]")
        if cache_clear_interval_frames < 1:
            raise ValueError("cache_clear_interval_frames must be >= 1")

        self._memory_fraction = memory_fraction
        self._cache_clear_interval_frames = cache_clear_interval_frames
        self._frames_since_cleanup = 0
        self._initialized = False
        self._lock = threading.Lock()

    def initialize(self) -> bool:
        """Initialize CUDA policy for this process."""
        if not torch.cuda.is_available():
            return False

        with self._lock:
            if self._initialized:
                return True

            try:
                torch.cuda.set_per_process_memory_fraction(self._memory_fraction)
            except RuntimeError as exc:
                logger.warning(
                    "Unable to set CUDA process memory fraction %.2f: %s",
                    self._memory_fraction,
                    exc,
                )

            self.clear_cache(reset_peak=True)
            self._initialized = True

        return True

    def clear_cache(self, reset_peak: bool) -> None:
        """Clear CUDA allocator cache."""
        if not torch.cuda.is_available():
            return

        try:
            torch.cuda.empty_cache()
        except RuntimeError as exc:
            logger.warning("torch.cuda.empty_cache failed: %s", exc)

        if not reset_peak:
            return

        try:
            torch.cuda.reset_peak_memory_stats()
        except RuntimeError as exc:
            logger.warning("torch.cuda.reset_peak_memory_stats failed: %s", exc)

    def record_inference_complete(self) -> None:
        """Trim CUDA cache on a bounded frame cadence."""
        if not torch.cuda.is_available():
            return

        should_clear = False
        with self._lock:
            self._frames_since_cleanup += 1
            if (
                self._frames_since_cleanup
                >= self._cache_clear_interval_frames
            ):
                self._frames_since_cleanup = 0
                should_clear = True

        if should_clear:
            self.clear_cache(reset_peak=True)

    def snapshot(self) -> GPUMemorySnapshot:
        """Return current CUDA memory usage."""
        if not torch.cuda.is_available():
            return GPUMemorySnapshot(0.0, 0.0, 0.0, 0.0, 0.0)

        try:
            free_bytes, total_bytes = torch.cuda.mem_get_info()
            return GPUMemorySnapshot(
                allocated_mb=torch.cuda.memory_allocated() / (1024 * 1024),
                reserved_mb=torch.cuda.memory_reserved() / (1024 * 1024),
                peak_allocated_mb=torch.cuda.max_memory_allocated()
                / (1024 * 1024),
                free_mb=free_bytes / (1024 * 1024),
                total_mb=total_bytes / (1024 * 1024),
            )
        except RuntimeError as exc:
            logger.warning("Unable to fetch CUDA memory snapshot: %s", exc)
            return GPUMemorySnapshot(0.0, 0.0, 0.0, 0.0, 0.0)

    def cleanup(self) -> None:
        """Best-effort cleanup for process shutdown."""
        if not torch.cuda.is_available():
            return

        self.clear_cache(reset_peak=False)
        try:
            torch.cuda.synchronize()
        except RuntimeError as exc:
            logger.warning("torch.cuda.synchronize failed during cleanup: %s", exc)


_GPU_MEMORY_MANAGER = GPUMemoryManager(
    memory_fraction=DETECTION_GPU_MEMORY_FRACTION,
    cache_clear_interval_frames=DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES,
)
atexit.register(_GPU_MEMORY_MANAGER.cleanup)


def get_gpu_memory_manager() -> GPUMemoryManager:
    """Return the shared GPU memory manager instance."""
    return _GPU_MEMORY_MANAGER
