"""Background GPU memory monitor for the detection engine."""

from __future__ import annotations

import logging
import threading
from typing import Optional

import torch

from detection_engine.memory_manager import GPUMemoryManager

logger = logging.getLogger(__name__)


def _run_gpu_monitor(
    stop_event: threading.Event,
    interval_seconds: int,
    gpu_memory_manager: GPUMemoryManager,
) -> None:
    """Emit periodic GPU memory metrics until stop_event is set."""
    while not stop_event.wait(interval_seconds):
        if not torch.cuda.is_available():
            continue
        snapshot = gpu_memory_manager.snapshot()
        logger.info(
            "GPU memory allocated=%.1fMB reserved=%.1fMB peak=%.1fMB "
            "free=%.1fMB total=%.1fMB",
            snapshot.allocated_mb,
            snapshot.reserved_mb,
            snapshot.peak_allocated_mb,
            snapshot.free_mb,
            snapshot.total_mb,
        )


def start_gpu_monitor(
    *,
    interval_seconds: int,
    gpu_memory_manager: GPUMemoryManager,
) -> tuple[Optional[threading.Event], Optional[threading.Thread]]:
    """Start periodic GPU memory logging and return (stop_event, thread)."""
    if interval_seconds < 1:
        raise ValueError("interval_seconds must be >= 1")
    if not torch.cuda.is_available():
        return None, None

    stop_event = threading.Event()
    thread = threading.Thread(
        target=_run_gpu_monitor,
        args=(stop_event, interval_seconds, gpu_memory_manager),
        name="gpu-memory-monitor",
        daemon=True,
    )
    thread.start()
    logger.info("GPU memory monitor started (interval=%ss)", interval_seconds)
    return stop_event, thread


def stop_gpu_monitor(
    stop_event: Optional[threading.Event],
    thread: Optional[threading.Thread],
) -> None:
    """Stop a previously started GPU memory monitor."""
    if stop_event is None or thread is None:
        return
    stop_event.set()
    thread.join(timeout=2.0)
    logger.info("GPU memory monitor stopped")
