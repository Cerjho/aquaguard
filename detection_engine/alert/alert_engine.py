"""Alert engine — dispatches confirmed drowning alerts via MQTT, API, and logger."""
import base64
import datetime
import logging
import threading
import uuid
from typing import TYPE_CHECKING

import cv2
import numpy as np

from detection_engine.models_data.alert_payload import AlertPayload

if TYPE_CHECKING:
    from detection_engine.alert.mqtt_client import MQTTClient
    from detection_engine.alert.api_client import APIClient

logger = logging.getLogger(__name__)


class AlertEngine:
    """Dispatches drowning alerts concurrently via MQTT, REST API, and logger.

    CRITICAL: snapshot_dir must be an absolute path resolved by main.py using
    os.path.abspath(__file__) — never passed as a relative path.
    """

    def __init__(self, mqtt_client: "MQTTClient", api_client: "APIClient", snapshot_dir: str):
        self._mqtt = mqtt_client
        self._api = api_client
        self._snapshot_dir = snapshot_dir

    def dispatch(
        self,
        zone_id: str,
        track_id: str,
        score: float,
        frame: np.ndarray,
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
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"

        # Encode frame to JPEG bytes
        success, buf = cv2.imencode(".jpg", frame)
        if not success:
            logger.error("Failed to encode snapshot for event %s", event_id)
            return

        # Write JPEG to disk
        snapshot_filename = f"{event_id}.jpg"
        snapshot_path = f"{self._snapshot_dir}/{snapshot_filename}"
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
        )

        payload_dict = {
            "event_id": event_id,
            "zone_id": zone_id,
            "track_id": track_id,
            "score": score,
            "snapshot_path": snapshot_path,
            "timestamp": timestamp,
        }

        # Dispatch concurrently — daemon threads so they don't block shutdown
        t1 = threading.Thread(
            target=self._send_mqtt, args=(payload_dict,), daemon=True, name=f"mqtt-{event_id[:8]}"
        )
        t2 = threading.Thread(
            target=self._send_api, args=(payload,), daemon=True, name=f"api-{event_id[:8]}"
        )
        t3 = threading.Thread(
            target=self._log_alert, args=(zone_id, track_id, score, event_id, timestamp),
            daemon=True, name=f"log-{event_id[:8]}",
        )
        t1.start()
        t2.start()
        t3.start()

    def _send_mqtt(self, payload_dict: dict) -> None:
        try:
            self._mqtt.publish_alert(payload_dict)
        except Exception as exc:
            logger.error("AlertEngine MQTT dispatch failed: %s", exc)

    def _send_api(self, payload: AlertPayload) -> None:
        try:
            self._api.log_event(payload)
        except Exception as exc:
            logger.error("AlertEngine API dispatch failed: %s", exc)

    def _log_alert(
        self, zone_id: str, track_id: str, score: float, event_id: str, timestamp: str
    ) -> None:
        logger.info(
            "ALERT DISPATCHED | event=%s zone=%s track=%s score=%.4f ts=%s",
            event_id, zone_id, track_id, score, timestamp,
        )
