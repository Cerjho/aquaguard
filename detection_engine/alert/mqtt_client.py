"""MQTT client — paho-mqtt 2.x wrapper for alert and detection publishing."""
import json
import logging
import time

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config.settings import MQTT_TOPIC_ALERT, MQTT_TOPIC_DETECTION

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
        self._client = mqtt.Client(callback_api_version=CallbackAPIVersion.VERSION2)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect

    def connect(self) -> None:
        """Connect to broker and start background network loop."""
        self._client.connect(self._broker_host, self._broker_port)
        self._client.loop_start()
        logger.info("MQTT connected to %s:%d", self._broker_host, self._broker_port)

    def publish_alert(self, payload: dict) -> None:
        """Serialize payload to JSON and publish to alert topic with QoS 1."""
        try:
            self._client.publish(MQTT_TOPIC_ALERT, json.dumps(payload), qos=1)
        except Exception as exc:
            logger.error("MQTT publish_alert failed: %s", exc)

    def publish_detection(self, payload: dict) -> None:
        """Serialize payload to JSON and publish to detection topic with QoS 0."""
        try:
            self._client.publish(MQTT_TOPIC_DETECTION, json.dumps(payload), qos=0)
        except Exception as exc:
            logger.error("MQTT publish_detection failed: %s", exc)

    # ── Callbacks (paho-mqtt 2.x — 5-argument signatures required) ───────────

    def _on_connect(self, client, userdata, connect_flags, reason_code, properties):
        if reason_code == 0:
            logger.info("MQTT broker connection established")
        else:
            logger.warning("MQTT connect returned reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        logger.warning(
            "MQTT disconnected (reason_code=%s) — retrying in %ds",
            reason_code, _RECONNECT_DELAY_SECONDS,
        )
        time.sleep(_RECONNECT_DELAY_SECONDS)
        try:
            client.reconnect()
        except Exception as exc:
            logger.error("MQTT reconnect failed: %s", exc)
