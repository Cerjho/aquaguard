"""MQTT bridge that ingests ESP32 device heartbeats into runtime status."""

from __future__ import annotations

import json
import os
from typing import Any

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from config.settings import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_TOPIC_DEVICE_STATUS,
)
from runtime_status import update_esp32_heartbeat


from utils.env_utils import is_truthy

def _is_enabled(env_name: str, default: bool) -> bool:
    value = os.getenv(env_name)
    if value is None:
        return default
    return is_truthy(value)


def _normalize_status(raw_status: Any) -> str:
    if isinstance(raw_status, bool):
        return "online" if raw_status else "offline"
    if raw_status is None:
        return "online"
    value = str(raw_status).strip().lower()
    return value or "online"


def _decode_payload(raw_payload: bytes | str) -> dict[str, Any] | None:
    payload_text: str
    if isinstance(raw_payload, bytes):
        try:
            payload_text = raw_payload.decode("utf-8")
        except UnicodeDecodeError:
            return None
    else:
        payload_text = raw_payload

    try:
        decoded = json.loads(payload_text)
    except json.JSONDecodeError:
        return None

    if not isinstance(decoded, dict):
        return None
    return decoded


def ingest_device_status_payload(raw_payload: bytes | str, logger=None) -> bool:
    """Parse MQTT payload and update backend ESP32 heartbeat state."""
    payload = _decode_payload(raw_payload)
    if payload is None:
        if logger:
            logger.warning("ESP32 heartbeat payload is not valid JSON object")
        return False

    device_id = payload.get("device_id")
    if not device_id:
        if logger:
            logger.warning("ESP32 heartbeat payload missing device_id")
        return False

    update_esp32_heartbeat(
        device_id=str(device_id),
        status=_normalize_status(payload.get("status")),
        uptime_ms=payload.get("uptime_ms"),
        timestamp=payload.get("timestamp"),
    )
    return True


class Esp32MqttBridge:
    """Subscribe to ESP32 MQTT heartbeats and feed backend runtime status."""

    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        topic: str,
        logger,
    ) -> None:
        self._broker_host = broker_host
        self._broker_port = int(broker_port)
        self._topic = topic
        self._logger = logger
        self._client = mqtt.Client(
            CallbackAPIVersion.VERSION2,
            client_id="aquaguard-backend-esp32-bridge",
            reconnect_on_failure=True,
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)

    def start(self) -> None:
        self._client.connect_async(
            host=self._broker_host,
            port=self._broker_port,
            keepalive=60,
        )
        self._client.loop_start()

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata,
        connect_flags,
        reason_code,
        properties,
    ) -> None:
        del userdata, connect_flags, properties
        if reason_code != 0:
            self._logger.warning(
                "ESP32 MQTT bridge connect failed: %s",
                reason_code,
            )
            return

        client.subscribe(self._topic, qos=1)
        self._logger.info(
            "ESP32 MQTT bridge subscribed to %s (%s:%s)",
            self._topic,
            self._broker_host,
            self._broker_port,
        )

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata,
        disconnect_flags,
        reason_code,
        properties,
    ) -> None:
        del client, userdata, disconnect_flags, properties
        if reason_code != 0:
            self._logger.warning(
                "ESP32 MQTT bridge disconnected unexpectedly: %s",
                reason_code,
            )

    def _on_message(self, client: mqtt.Client, userdata, message) -> None:
        del client, userdata
        if message.topic != self._topic:
            return
        handled = ingest_device_status_payload(message.payload, logger=self._logger)
        if not handled:
            self._logger.warning("Ignored invalid ESP32 status payload on %s", self._topic)


def start_esp32_mqtt_bridge(app):
    """Start MQTT subscriber for ESP32 status, unless explicitly disabled."""
    if not _is_enabled("ESP32_MQTT_BRIDGE_ENABLED", True):
        app.logger.info("ESP32 MQTT bridge disabled by ESP32_MQTT_BRIDGE_ENABLED")
        return None

    broker_host = os.getenv("MQTT_BROKER_HOST", MQTT_BROKER_HOST)
    broker_port_raw = os.getenv("MQTT_BROKER_PORT", str(MQTT_BROKER_PORT))
    topic = os.getenv("MQTT_TOPIC_DEVICE_STATUS", MQTT_TOPIC_DEVICE_STATUS)

    try:
        broker_port = int(broker_port_raw)
    except ValueError:
        app.logger.warning(
            "Invalid MQTT_BROKER_PORT=%s, falling back to %s",
            broker_port_raw,
            MQTT_BROKER_PORT,
        )
        broker_port = MQTT_BROKER_PORT

    bridge = Esp32MqttBridge(
        broker_host=broker_host,
        broker_port=broker_port,
        topic=topic,
        logger=app.logger,
    )

    try:
        bridge.start()
    except (OSError, ValueError) as exc:
        app.logger.error("Failed to start ESP32 MQTT bridge: %s", exc)
        return None

    app.logger.info(
        "ESP32 MQTT bridge started for %s:%s topic=%s",
        broker_host,
        broker_port,
        topic,
    )
    return bridge
