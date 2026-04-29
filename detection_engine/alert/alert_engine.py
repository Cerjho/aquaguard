"""Alert engine — dispatches confirmed drowning alerts via MQTT, API, and logger."""
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
                                logger.debug("Failed to delete stale snapshot %s: %s", entry.path, exc)
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

        Three daemon threads are launched simultaneously for MQTT, API,
        and logger so that a slow channel does not delay the others.

        Args:
            zone_id:  Camera zone identifier.
            track_id: ByteTrack person identifier.
            score:    Final drowning confidence score [0.0, 1.0].
            frame:    Latest BGR frame at time of alert.
        """
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

        payload_dict = {
            "event_id": event_id,
            "zone_id": zone_id,
            "track_id": track_id,
            "score": score,
            "snapshot_path": snapshot_path,
            "timestamp": timestamp,
            "bbox": list(bbox) if bbox is not None else None,
        }

        # Dispatch asynchronously through a bounded pool to avoid unbounded thread growth.
        self._executor.submit(self._send_mqtt, payload_dict)
        self._executor.submit(self._send_api, payload)
        self._executor.submit(self._log_alert, zone_id, track_id, score, event_id, timestamp)

    def should_trigger_alert(
        self,
        zone_id: str,
        track_id: str,
        final_confidence: float,
        class_label: str | None = None,
        behavior_flags: Any | None = None,
    ) -> bool:
        """Compatibility gate for pipeline callback alert dispatch decisions.

        The confidence filter already applies rolling-window and interval control,
        so this gate currently returns True to allow sustained drowning re-alerts.
        """
        _ = (zone_id, track_id, final_confidence, class_label, behavior_flags)
        return True

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
        """Compatibility wrapper used by the multi-threaded pipeline callback."""
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
