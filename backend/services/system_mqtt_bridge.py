"""MQTT bridge that subscribes to system events and forwards them via SocketIO."""

import json
import logging
import os
from typing import Any

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from config.settings import MQTT_BROKER_HOST, MQTT_BROKER_PORT
from extensions import socketio


class SystemMqttBridge:
    """Subscribe to backend system topics and bridge events to SocketIO."""

    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        logger: logging.Logger,
    ) -> None:
        self._broker_host = broker_host
        self._broker_port = broker_port
        self._logger = logger
        self._client = mqtt.Client(
            CallbackAPIVersion.VERSION2,
            client_id="aquaguard-backend-system-bridge",
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
        userdata: Any,
        connect_flags: Any,
        reason_code: Any,
        properties: Any,
    ) -> None:
        del userdata, connect_flags, properties
        if reason_code != 0:
            self._logger.warning(
                "System MQTT bridge connect failed: %s",
                reason_code,
            )
            return

        client.subscribe("aquaguard/system/#", qos=1)
        self._logger.info(
            "System MQTT bridge subscribed to aquaguard/system/# (%s:%s)",
            self._broker_host,
            self._broker_port,
        )

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: Any,
        disconnect_flags: Any,
        reason_code: Any,
        properties: Any,
    ) -> None:
        del client, userdata, disconnect_flags, properties
        if reason_code != 0:
            self._logger.warning(
                "System MQTT bridge disconnected unexpectedly: %s",
                reason_code,
            )

    def _on_message(self, client: mqtt.Client, userdata: Any, message: Any) -> None:
        del client, userdata
        try:
            payload_text = message.payload.decode("utf-8")
            payload = json.loads(payload_text)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._logger.warning("System MQTT bridge ignored non-JSON payload on %s", message.topic)
            return

        if message.topic == "aquaguard/system/clip_ready":
            # Note: We omit the 'message_type' and 'component' wrapper here
            # to match the original socketio schema expected by frontend
            # The payload contains 'clip_id', 'zone_id', etc which are sufficient
            socketio.emit("clip_ready", payload)
            self._logger.info("Bridged clip_ready event via SocketIO: %s", payload.get("clip_id"))
        elif message.topic == "aquaguard/system/disk_warning":
            # Map disk warning to a system_status SocketIO event
            status_payload = {
                "component": "clip_capture",
                "status": "warning",
                "message": f"Disk space below {payload.get('threshold_gb', 0)}GB threshold on {payload.get('zone_id', 'unknown')}"
            }
            socketio.emit("system_status", status_payload)
            self._logger.info("Bridged disk_warning event via SocketIO for %s", payload.get("zone_id"))


def start_system_mqtt_bridge(app) -> SystemMqttBridge | None:
    """Start MQTT subscriber for cross-container system events."""
    broker_host = os.getenv("MQTT_BROKER_HOST", MQTT_BROKER_HOST)
    broker_port_raw = os.getenv("MQTT_BROKER_PORT", str(MQTT_BROKER_PORT))

    try:
        broker_port = int(broker_port_raw)
    except ValueError:
        app.logger.warning(
            "Invalid MQTT_BROKER_PORT=%s, falling back to %s",
            broker_port_raw,
            MQTT_BROKER_PORT,
        )
        broker_port = MQTT_BROKER_PORT

    bridge = SystemMqttBridge(
        broker_host=broker_host,
        broker_port=broker_port,
        logger=app.logger,
    )

    try:
        bridge.start()
    except (OSError, ValueError) as exc:
        app.logger.error("Failed to start System MQTT bridge: %s", exc)
        return None

    app.logger.info(
        "System MQTT bridge started for %s:%s",
        broker_host,
        broker_port,
    )
    return bridge
