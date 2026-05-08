"""GPU memory management utilities for continuous detection inference.

Phase 2 enhancements:
- Adaptive memory pressure detection (NORMAL / WARNING / CRITICAL tiers)
- Proactive cache clearing based on actual VRAM utilization, not just frame count
- Memory pressure callback for backpressure integration
- MQTT memory pressure alerts
- Emergency OOM prevention (force cache clear + GC when utilization > 90%)
"""

from __future__ import annotations

import atexit
import gc
import logging
import threading
import time
from dataclasses import dataclass
from typing import Callable, Optional

import torch

from config.settings import (
    DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES,
    DETECTION_GPU_MEMORY_FRACTION,
)

logger = logging.getLogger(__name__)

# ── Memory pressure thresholds (fraction of total VRAM) ──────────────────────
_WARNING_UTILIZATION = 0.70   # 70% — increase cache clear frequency
_CRITICAL_UTILIZATION = 0.85  # 85% — force clear + notify
_EMERGENCY_UTILIZATION = 0.92 # 92% — emergency GC + aggressive clear

# Cadence overrides per pressure tier
_NORMAL_CLEAR_INTERVAL = None  # Use default from settings
_WARNING_CLEAR_INTERVAL = 5   # Clear every 5 frames under WARNING
_CRITICAL_CLEAR_INTERVAL = 1  # Clear every frame under CRITICAL

_MEMORY_CHECK_INTERVAL_FRAMES = 5  # Check VRAM utilization every N frames


class MemoryPressureTier:
    """GPU memory pressure tiers."""
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    EMERGENCY = "EMERGENCY"


@dataclass(frozen=True)
class GPUMemorySnapshot:
    """Normalized GPU memory snapshot in MB."""

    allocated_mb: float
    reserved_mb: float
    peak_allocated_mb: float
    free_mb: float
    total_mb: float

    @property
    def utilization(self) -> float:
        """VRAM utilization as a fraction (0.0–1.0)."""
        if self.total_mb <= 0:
            return 0.0
        return (self.total_mb - self.free_mb) / self.total_mb


class GPUMemoryManager:
    """Manage CUDA memory lifecycle for long-running inference loops.

    Phase 2 additions:
    - Adaptive pressure tiers (NORMAL / WARNING / CRITICAL / EMERGENCY)
    - Proactive cache clearing based on actual VRAM utilization
    - on_pressure_change callback for backpressure integration
    - Emergency OOM prevention with forced GC
    """

    def __init__(
        self,
        memory_fraction: float,
        cache_clear_interval_frames: int,
        on_pressure_change: Optional[
            Callable[[str, str, float], None]
        ] = None,
    ) -> None:
        """
        Args:
            memory_fraction: Max CUDA memory fraction (0, 1].
            cache_clear_interval_frames: Default cadence for cache clearing.
            on_pressure_change: Optional callback(old_tier, new_tier, utilization)
                                called on tier transitions.
        """
        if not 0 < memory_fraction <= 1:
            raise ValueError("memory_fraction must be in range (0, 1]")
        if cache_clear_interval_frames < 1:
            raise ValueError("cache_clear_interval_frames must be >= 1")

        self._memory_fraction = memory_fraction
        self._default_cache_clear_interval = cache_clear_interval_frames
        self._active_clear_interval = cache_clear_interval_frames
        self._frames_since_cleanup = 0
        self._frames_since_memory_check = 0
        self._initialized = False
        self._lock = threading.Lock()

        # Memory pressure state
        self._pressure_tier = MemoryPressureTier.NORMAL
        self._on_pressure_change = on_pressure_change
        self._last_utilization = 0.0
        self._emergency_count = 0

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
        """Post-inference hook: trim CUDA cache and check memory pressure.

        Called after every inference frame. Adapts cache clearing frequency
        based on actual VRAM utilization.
        """
        if not torch.cuda.is_available():
            return

        should_clear = False
        should_check_memory = False

        with self._lock:
            self._frames_since_cleanup += 1
            self._frames_since_memory_check += 1

            if self._frames_since_cleanup >= self._active_clear_interval:
                self._frames_since_cleanup = 0
                should_clear = True

            if self._frames_since_memory_check >= _MEMORY_CHECK_INTERVAL_FRAMES:
                self._frames_since_memory_check = 0
                should_check_memory = True

        if should_clear:
            self.clear_cache(reset_peak=True)

        if should_check_memory:
            self._evaluate_memory_pressure()

    def _evaluate_memory_pressure(self) -> None:
        """Check VRAM utilization and adjust pressure tier + clear interval."""
        snap = self.snapshot()
        utilization = snap.utilization
        self._last_utilization = utilization

        if utilization >= _EMERGENCY_UTILIZATION:
            new_tier = MemoryPressureTier.EMERGENCY
        elif utilization >= _CRITICAL_UTILIZATION:
            new_tier = MemoryPressureTier.CRITICAL
        elif utilization >= _WARNING_UTILIZATION:
            new_tier = MemoryPressureTier.WARNING
        else:
            new_tier = MemoryPressureTier.NORMAL

        if new_tier != self._pressure_tier:
            old_tier = self._pressure_tier
            self._pressure_tier = new_tier

            # Adjust cache clear interval
            self._update_clear_interval(new_tier)

            logger.warning(
                "GPU memory pressure: %s → %s (utilization=%.1f%%, "
                "allocated=%.0fMB, free=%.0fMB, total=%.0fMB)",
                old_tier, new_tier,
                utilization * 100,
                snap.allocated_mb, snap.free_mb, snap.total_mb,
            )

            if self._on_pressure_change is not None:
                try:
                    self._on_pressure_change(old_tier, new_tier, utilization)
                except Exception as exc:
                    logger.warning(
                        "on_pressure_change callback error: %s", exc,
                    )

        # Emergency response: force aggressive cleanup
        if new_tier == MemoryPressureTier.EMERGENCY:
            self._handle_emergency(snap)

    def _update_clear_interval(self, tier: str) -> None:
        """Adjust cache clear frequency based on memory pressure tier."""
        with self._lock:
            if tier == MemoryPressureTier.NORMAL:
                self._active_clear_interval = self._default_cache_clear_interval
            elif tier == MemoryPressureTier.WARNING:
                self._active_clear_interval = _WARNING_CLEAR_INTERVAL
            elif tier in (
                MemoryPressureTier.CRITICAL,
                MemoryPressureTier.EMERGENCY,
            ):
                self._active_clear_interval = _CRITICAL_CLEAR_INTERVAL

    def _handle_emergency(self, snap: GPUMemorySnapshot) -> None:
        """Emergency OOM prevention: aggressive cache clear + Python GC."""
        self._emergency_count += 1

        # Force cache clear
        self.clear_cache(reset_peak=True)

        # Force Python garbage collection to release any dangling tensors
        gc.collect()

        # Try to synchronize and clear again
        try:
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
        except RuntimeError as exc:
            logger.warning("Emergency CUDA cleanup failed: %s", exc)

        # Check if emergency helped
        post_snap = self.snapshot()
        freed_mb = snap.allocated_mb - post_snap.allocated_mb

        logger.critical(
            "GPU EMERGENCY cleanup #%d: freed %.1fMB "
            "(%.1f%% → %.1f%% utilization)",
            self._emergency_count,
            max(0, freed_mb),
            snap.utilization * 100,
            post_snap.utilization * 100,
        )

    @property
    def pressure_tier(self) -> str:
        """Current memory pressure tier."""
        return self._pressure_tier

    @property
    def last_utilization(self) -> float:
        """Last measured VRAM utilization (0.0–1.0)."""
        return self._last_utilization

    @property
    def emergency_count(self) -> int:
        """Number of emergency cleanup cycles triggered."""
        return self._emergency_count

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
