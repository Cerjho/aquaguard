"""MQTT client — paho-mqtt 2.x wrapper for alert and detection publishing."""
import json
import logging
import time
import threading

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from config.settings import MQTT_TOPIC_ALERT, MQTT_TOPIC_DETECTION, MQTT_TOPIC_CAMERA_HEALTH

logger = logging.getLogger(__name__)

_RECONNECT_DELAY_SECONDS = 5


class MQTTClient:
    """Publishes alert and detection payloads to the MQTT broker.

    Uses paho-mqtt 2.x (CallbackAPIVersion.VERSION2) — callback signatures
    require 5 arguments (client, userdata, connect_flags, reason_code, properties).
    Using old 3/4-argument signatures raises TypeError at runtime.
    """

    def __init__(self, broker_host: str, broker_port: int):
        self._broker_host = broker_host
        self._broker_port = broker_port
        self._closing = threading.Event()
        self._client = mqtt.Client(callback_api_version=CallbackAPIVersion.VERSION2)
        self._client.max_queued_messages_set(100)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._last_camera_status: dict[str, str] = {}

    def connect(self) -> None:
        """Connect to broker and start background network loop."""
        self._client.connect(self._broker_host, self._broker_port)
        self._client.loop_start()
        logger.info("MQTT connected to %s:%d", self._broker_host, self._broker_port)

    def publish_alert(self, payload: dict) -> None:
        """Serialize payload to JSON and publish to alert topic with QoS 1."""
        try:
            self._client.publish(MQTT_TOPIC_ALERT, json.dumps(payload), qos=1)
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error("MQTT publish_alert failed: %s", exc)

    def publish_detection(self, payload: dict) -> None:
        """Serialize payload to JSON and publish to detection topic with QoS 0."""
        try:
            self._client.publish(MQTT_TOPIC_DETECTION, json.dumps(payload), qos=0)
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error("MQTT publish_detection failed: %s", exc)

    def publish_camera_health(
        self,
        zone_id: str,
        status: str,
        reason: str = "",
        metrics: dict = None,
    ) -> None:
        """Publish camera health status change to MQTT.

        Only publishes if status has changed since last publish for this zone.

        Args:
            zone_id: Camera zone identifier.
            status: One of 'online', 'offline', 'degraded', 'connecting'.
            reason: Optional reason for status (e.g., 'stall_detected', 'reconnect').
            metrics: Optional dict with fps_actual, corruption_rate, etc.
        """
        last_status = self._last_camera_status.get(zone_id)
        if last_status == status:
            return

        self._last_camera_status[zone_id] = status

        from datetime import datetime, timezone
        payload = {
            "message_type": "camera_health",
            "zone_id": zone_id,
            "status": status,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if metrics:
            payload.update(metrics)

        try:
            self._client.publish(MQTT_TOPIC_CAMERA_HEALTH, json.dumps(payload), qos=1)
            logger.info(
                "MQTT camera health: zone=%s status=%s reason=%s",
                zone_id,
                status,
                reason or "none",
            )
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error("MQTT publish_camera_health failed: %s", exc)

    def close(self) -> None:
        """Stop MQTT loop and disconnect broker connection."""
        self._closing.set()
        try:
            self._client.loop_stop()
        except (OSError, RuntimeError) as exc:
            logger.warning("MQTT loop_stop failed: %s", exc)
        try:
            self._client.disconnect()
        except (OSError, RuntimeError) as exc:
            logger.warning("MQTT disconnect failed: %s", exc)
        logger.info("MQTT client closed")

    # ── Callbacks (paho-mqtt 2.x — 5-argument signatures required) ───────────

    def _on_connect(self, client, userdata, connect_flags, reason_code, properties):
        if reason_code == 0:
            logger.info("MQTT broker connection established")
        else:
            logger.warning("MQTT connect returned reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        if self._closing.is_set():
            logger.info("MQTT disconnected cleanly during shutdown")
            return
        logger.warning(
            "MQTT disconnected (reason_code=%s) — retrying in %ds",
            reason_code, _RECONNECT_DELAY_SECONDS,
        )
        time.sleep(_RECONNECT_DELAY_SECONDS)
        try:
            client.reconnect()
        except (OSError, RuntimeError) as exc:
            logger.error("MQTT reconnect failed: %s", exc)
