"""Background GPU memory monitor for the detection engine.

Phase 2 enhancements:
- Logs memory pressure tier alongside raw metrics
- Publishes MQTT alerts on pressure tier transitions
- Reports emergency cleanup count
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

import torch

from detection_engine.memory_manager import GPUMemoryManager, MemoryPressureTier

logger = logging.getLogger(__name__)

_MQTT_TOPIC_GPU_PRESSURE = "aquaguard/system/gpu_memory_pressure"


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
        tier = gpu_memory_manager.pressure_tier
        emergencies = gpu_memory_manager.emergency_count
        logger.info(
            "GPU memory allocated=%.1fMB reserved=%.1fMB peak=%.1fMB "
            "free=%.1fMB total=%.1fMB utilization=%.1f%% "
            "pressure=%s emergencies=%d",
            snapshot.allocated_mb,
            snapshot.reserved_mb,
            snapshot.peak_allocated_mb,
            snapshot.free_mb,
            snapshot.total_mb,
            snapshot.utilization * 100,
            tier,
            emergencies,
        )


def create_mqtt_pressure_callback(mqtt_client) -> callable:
    """Create a pressure-change callback that publishes to MQTT.

    Args:
        mqtt_client: MQTTClient instance (or None).

    Returns:
        Callback function(old_tier, new_tier, utilization).
    """
    _last_published_tier = [None]

    def _on_pressure_change(old_tier: str, new_tier: str, utilization: float):
        if mqtt_client is None:
            return
        # Only publish on non-NORMAL transitions
        if new_tier == MemoryPressureTier.NORMAL and old_tier == MemoryPressureTier.NORMAL:
            return

        _last_published_tier[0] = new_tier
        payload = {
            "message_type": "gpu_memory_pressure",
            "old_tier": old_tier,
            "new_tier": new_tier,
            "utilization": round(utilization, 3),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            mqtt_client._client.publish(
                _MQTT_TOPIC_GPU_PRESSURE,
                json.dumps(payload),
                qos=0,
            )
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.warning("Failed to publish GPU pressure MQTT: %s", exc)

    return _on_pressure_change


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
