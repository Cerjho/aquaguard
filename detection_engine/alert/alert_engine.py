"""Alert engine for dispatching confirmed drowning alerts to MQTT and API."""
import atexit
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import logging
import uuid
import os
import queue
import threading
import time
from typing import TYPE_CHECKING, Any, Optional, Tuple

import cv2
import numpy as np

from detection_engine.models_data.alert_payload import AlertPayload
from config.settings import (
    ALERT_ACTIVE_MQTT_INTERVAL_SECONDS,
    ALERT_COOLDOWN_SECONDS,
)

if TYPE_CHECKING:
    from detection_engine.alert.mqtt_client import MQTTClient
    from detection_engine.alert.api_client import APIClient

logger = logging.getLogger(__name__)


class BoundedThreadPoolExecutor(ThreadPoolExecutor):
    def __init__(self, max_workers=None, thread_name_prefix='', max_queue_size=100):
        super().__init__(max_workers=max_workers, thread_name_prefix=thread_name_prefix)
        self._work_queue = queue.Queue(maxsize=max_queue_size)


class AlertEngine:
    """Dispatches drowning alerts concurrently via MQTT, REST API, and logger.

    EPHEMERAL ALERTS: No retrigger cooldown. Frontend manages 3-sec auto-close.

    CRITICAL: snapshot_dir must be an absolute path resolved by main.py using
    os.path.abspath(__file__) — never passed as a relative path.
    """

    def __init__(
        self,
        mqtt_client: "MQTTClient",
        api_client: "APIClient",
        snapshot_dir: str,
        max_workers: int = 6,
    ):
        self._mqtt = mqtt_client
        self._api = api_client
        self._snapshot_dir = snapshot_dir
        self._executor = BoundedThreadPoolExecutor(
            max_workers=max(int(max_workers), 3),
            thread_name_prefix="alert-dispatch",
            max_queue_size=100,
        )
        self._closed = False
        self._last_alert_time: dict[str, float] = {}  # track_id → monotonic time
        self._last_hardware_alert_publish: dict[str, float] = {}
        atexit.register(self.close)

        # Start background cleanup thread for snapshots
        self._cleanup_thread = threading.Thread(
            target=self._snapshot_cleanup_loop,
            name="snapshot-cleanup",
            daemon=True,
        )
        self._cleanup_thread.start()

    def _snapshot_cleanup_loop(self) -> None:
        """Periodically clean up snapshot files older than 7 days to prevent disk leak."""
        retention_seconds = 7 * 24 * 3600
        while not self._closed:
            try:
                now = time.time()
                for entry in os.scandir(self._snapshot_dir):
                    if entry.is_file() and entry.name.endswith(".jpg"):
                        if now - entry.stat().st_mtime > retention_seconds:
                            try:
                                os.remove(entry.path)
                            except OSError as exc:
                                logger.debug(
                                    "Failed to delete stale snapshot %s: %s",
                                    entry.path,
                                    exc,
                                )
            except OSError as exc:
                logger.error("Snapshot cleanup loop failed: %s", exc)

            # Sleep for 24 hours, waking up occasionally to check if closed
            for _ in range(24 * 60):
                if self._closed:
                    return
                time.sleep(60)

    def dispatch(
        self,
        zone_id: str,
        track_id: str,
        score: float,
        frame: np.ndarray,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        class_label: str | None = None,
        yolo_confidence: float | None = None,
        pose_confidence: float | None = None,
        final_confidence: float | None = None,
    ) -> None:
        """Save snapshot and dispatch alert payload to all three channels.

        FIX R4: _record_alert_time() is now called here so the per-track
        cooldown is always applied, regardless of whether dispatch() is called
        directly or via dispatch_alert().  Previously the recording only
        happened inside dispatch_alert(), leaving the legacy _process_zone_frame
        path unprotected against alert storms.

        Three daemon threads are launched simultaneously for MQTT, API,
        and logger so that a slow channel does not delay the others.
        """
        # Always record dispatch time FIRST so cooldown is applied even if
        # something below raises an exception.
        self._record_alert_time(track_id)
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        # Encode frame to JPEG bytes
        success, buf = cv2.imencode(".jpg", frame)
        if not success:
            logger.error("Failed to encode snapshot for event %s", event_id)
            return

        # Write JPEG to disk
        snapshot_filename = f"{event_id}.jpg"
        snapshot_path = os.path.join(self._snapshot_dir, snapshot_filename)
        try:
            with open(snapshot_path, "wb") as fh:
                fh.write(buf.tobytes())
        except OSError as exc:
            logger.error("Failed to write snapshot %s: %s", snapshot_path, exc)
            snapshot_path = ""

        snapshot_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

        payload = AlertPayload(
            event_id=event_id,
            zone_id=zone_id,
            track_id=track_id,
            score=score,
            snapshot_path=snapshot_path,
            snapshot_b64=snapshot_b64,
            timestamp=timestamp,
            bbox=bbox,
            class_label=class_label,
            yolo_confidence=yolo_confidence,
            pose_confidence=pose_confidence,
            final_confidence=final_confidence if final_confidence is not None else score,
        )

        mqtt_hardware_payload = {
            "event_id": event_id,
            "zone_id": zone_id,
            "track_id": str(track_id),
        }

        # Dispatch asynchronously through a bounded pool to avoid unbounded thread growth.
        self._record_hardware_alert_publish(zone_id, track_id)
        self._executor.submit(self._send_mqtt, mqtt_hardware_payload)
        self._executor.submit(self._send_api, payload)
        self._executor.submit(self._log_alert, zone_id, track_id, score, event_id, timestamp)

    def dispatch_active_hardware_alert(self, zone_id: str, track_id: str) -> bool:
        """Refresh ESP32 alarm state while drowning remains continuously detected."""
        assert zone_id is not None and str(zone_id).strip(), "Alert: invalid zone_id"
        assert track_id is not None and str(track_id).strip(), "Alert: invalid track_id"

        now = time.monotonic()
        key = self._hardware_alert_key(zone_id, track_id)
        last_time = self._last_hardware_alert_publish.get(key)
        if (
            last_time is not None
            and (now - last_time) < ALERT_ACTIVE_MQTT_INTERVAL_SECONDS
        ):
            return False

        keepalive_payload = {
            "event_id": str(uuid.uuid4()),
            "zone_id": zone_id,
            "track_id": str(track_id),
            "message_type": "alert_keepalive",
        }
        self._record_hardware_alert_publish(zone_id, track_id)
        self._cleanup_stale_hardware_alerts(now, stale_threshold=300.0)
        self._executor.submit(self._send_mqtt, keepalive_payload)
        return True

    def should_trigger_alert(
        self,
        zone_id: str,
        track_id: str,
        final_confidence: float,
        class_label: str | None = None,
        behavior_flags: Any | None = None,
    ) -> bool:
        """Check per-track cooldown and validate fields before allowing dispatch.

        Returns False if the same track_id was alerted within ALERT_COOLDOWN_SECONDS.
        """
        assert zone_id is not None and str(zone_id).strip(), "Alert: invalid zone_id"
        assert track_id is not None and str(track_id).strip(), "Alert: invalid track_id"
        assert 0.0 <= final_confidence <= 1.0, f"Alert: confidence out of range {final_confidence}"
        _ = (class_label, behavior_flags)

        # Per-track cooldown: suppress duplicate alerts within the window
        now = time.monotonic()
        tid_key = str(track_id)
        last_time = self._last_alert_time.get(tid_key)
        if last_time is not None and (now - last_time) < ALERT_COOLDOWN_SECONDS:
            logger.debug(
                "Alert suppressed for track %s (cooldown %.1fs remaining)",
                tid_key,
                ALERT_COOLDOWN_SECONDS - (now - last_time),
            )
            return False

        # Cleanup stale entries older than 5 minutes to prevent memory growth
        self._cleanup_stale_alerts(now, stale_threshold=300.0)
        return True

    def _record_alert_time(self, track_id: str) -> None:
        """Record the dispatch time for per-track cooldown."""
        self._last_alert_time[str(track_id)] = time.monotonic()

    def _hardware_alert_key(self, zone_id: str, track_id: str) -> str:
        return f"{zone_id}:{track_id}"

    def _record_hardware_alert_publish(self, zone_id: str, track_id: str) -> None:
        key = self._hardware_alert_key(str(zone_id), str(track_id))
        self._last_hardware_alert_publish[key] = time.monotonic()

    def _cleanup_stale_alerts(self, now: float, stale_threshold: float = 300.0) -> None:
        """Remove cooldown entries older than stale_threshold seconds."""
        stale_ids = [
            tid for tid, ts in self._last_alert_time.items()
            if (now - ts) > stale_threshold
        ]
        for tid in stale_ids:
            self._last_alert_time.pop(tid, None)

    def _cleanup_stale_hardware_alerts(
        self, now: float, stale_threshold: float = 300.0
    ) -> None:
        stale_keys = [
            key
            for key, timestamp in self._last_hardware_alert_publish.items()
            if (now - timestamp) > stale_threshold
        ]
        for key in stale_keys:
            self._last_hardware_alert_publish.pop(key, None)

    def dispatch_alert(
        self,
        zone_id: str,
        track_id: str,
        frame: np.ndarray,
        bbox: Optional[Tuple[float, float, float, float]] = None,
        class_label: str | None = None,
        yolo_confidence: float | None = None,
        pose_confidence: float | None = None,
        final_confidence: float | None = None,
    ) -> None:
        """Compatibility wrapper used by the multi-threaded pipeline callback.

        _record_alert_time() is now handled inside dispatch() so it is not
        called here to avoid a double-record.
        """
        score = float(final_confidence) if final_confidence is not None else 0.0
        self.dispatch(
            zone_id=zone_id,
            track_id=str(track_id),
            score=score,
            frame=frame,
            bbox=bbox,
            class_label=class_label,
            yolo_confidence=yolo_confidence,
            pose_confidence=pose_confidence,
            final_confidence=final_confidence,
        )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _send_mqtt(self, payload_dict: dict) -> None:
        try:
            self._mqtt.publish_alert(payload_dict)
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error("AlertEngine MQTT dispatch failed: %s", exc)

    def _send_api(self, payload: AlertPayload) -> None:
        try:
            self._api.log_event(payload)
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error("AlertEngine API dispatch failed: %s", exc)

    def _log_alert(
        self, zone_id: str, track_id: str, score: float, event_id: str, timestamp: str
    ) -> None:
        logger.info(
            "ALERT DISPATCHED | event=%s zone=%s track=%s score=%.4f ts=%s",
            event_id, zone_id, track_id, score, timestamp,
        )
