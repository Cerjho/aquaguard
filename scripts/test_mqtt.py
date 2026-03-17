"""
AquaGuard MQTT Integration Test
================================
Publishes a mock drowning alert to ``aquaguard/alert`` and listens for
the ESP32 heartbeat on ``aquaguard/device/status``.

Usage:
    conda activate aquaguard_env
    python scripts/test_mqtt.py

Environment variables (optional — defaults to localhost:1883):
    MQTT_BROKER_HOST   IP / hostname of the Mosquitto broker (default: localhost)
    MQTT_BROKER_PORT   Port of the Mosquitto broker          (default: 1883)

Exit codes:
    0 — heartbeat received within 35 s → PASS
    1 — no heartbeat received           → FAIL (ESP32 not connected or not flashed)

Requirements:
    paho-mqtt==2.1.0  (TECH_STACK_LOCK.md)
"""

import os
import json
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

# ── Configuration (from env vars or defaults) ─────────────────────────────

BROKER_HOST: str = os.environ.get("MQTT_BROKER_HOST", "localhost")
BROKER_PORT: int = int(os.environ.get("MQTT_BROKER_PORT", "1883"))

TOPIC_ALERT   = "aquaguard/alert"
TOPIC_STATUS  = "aquaguard/device/status"
HEARTBEAT_TIMEOUT_S = 35        # seconds to wait for ESP32 heartbeat

# ── State shared between callbacks ────────────────────────────────────────

heartbeat_received: bool = False
heartbeat_payload: dict  = {}


# ── paho-mqtt 2.x callbacks (Rule R6-F: MUST be 5-argument form) ──────────

def on_connect(
    client: mqtt.Client,
    userdata,
    connect_flags,
    reason_code,
    properties,
) -> None:
    """Called when the client connects to the broker."""
    if reason_code.is_failure:
        print(f"[MQTT] Connection FAILED — reason: {reason_code}")
        return

    print(f"[MQTT] Connected to broker {BROKER_HOST}:{BROKER_PORT}  "
          f"(reason_code={reason_code})")

    # Subscribe to ESP32 heartbeat topic to verify the device is online
    client.subscribe(TOPIC_STATUS)
    print(f"[MQTT] Subscribed to '{TOPIC_STATUS}'")

    # Publish mock alert after successful connect
    _publish_mock_alert(client)


def on_message(
    client: mqtt.Client,
    userdata,
    msg: mqtt.MQTTMessage,
) -> None:
    """Called when a subscribed message arrives."""
    global heartbeat_received, heartbeat_payload

    print(f"\n[MQTT] Message received on '{msg.topic}'")
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print(f"[MQTT] Could not decode payload: {exc}")
        payload = {}

    print(f"         Payload: {json.dumps(payload, indent=2)}")

    if msg.topic == TOPIC_STATUS:
        heartbeat_received = True
        heartbeat_payload  = payload
        print("[MQTT] ✓ Heartbeat received from ESP32!")


# ── Helper: publish mock alert ─────────────────────────────────────────────

def _publish_mock_alert(client: mqtt.Client) -> None:
    """Publish a realistic mock drowning-alert JSON to aquaguard/alert."""
    alert = {
        "alert_id":   "test-001",
        "zone_id":    "pool-1",
        "confidence": 0.92,
        "timestamp":  datetime.now(timezone.utc).isoformat(),
    }
    payload_str = json.dumps(alert)
    result = client.publish(TOPIC_ALERT, payload_str)
    if result.rc == mqtt.MQTT_ERR_SUCCESS:
        print(f"\n[TEST]  Mock alert published to '{TOPIC_ALERT}'")
        print(f"        Payload: {payload_str}")
    else:
        print(f"[TEST]  ERROR publishing alert — rc={result.rc}")


# ── Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  AquaGuard MQTT Integration Test")
    print(f"  Broker : {BROKER_HOST}:{BROKER_PORT}")
    print(f"  Topics : publish → {TOPIC_ALERT}")
    print(f"           listen  → {TOPIC_STATUS}")
    print("=" * 60)

    # Create paho-mqtt 2.x client with VERSION2 callback API
    client = mqtt.Client(CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    # Connect to Mosquitto broker
    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    except ConnectionRefusedError:
        print(f"\n[ERROR] Could not connect to MQTT broker at "
              f"{BROKER_HOST}:{BROKER_PORT}")
        print("        Is Mosquitto running?  Try: mosquitto -v")
        raise SystemExit(1)
    except OSError as exc:
        print(f"\n[ERROR] Network error connecting to broker: {exc}")
        raise SystemExit(1)

    # Start non-blocking network loop
    client.loop_start()

    # Wait up to HEARTBEAT_TIMEOUT_S seconds for the ESP32 heartbeat
    print(f"\n[TEST]  Waiting up to {HEARTBEAT_TIMEOUT_S}s for ESP32 heartbeat...\n")
    deadline = time.time() + HEARTBEAT_TIMEOUT_S
    while not heartbeat_received and time.time() < deadline:
        time.sleep(0.5)

    client.loop_stop()
    client.disconnect()

    # ── Print result ──────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if heartbeat_received:
        device_id  = heartbeat_payload.get("device_id", "unknown")
        status     = heartbeat_payload.get("status",    "unknown")
        uptime_ms  = heartbeat_payload.get("uptime_ms", "unknown")
        print(f"  RESULT : PASS")
        print(f"  Device : {device_id}")
        print(f"  Status : {status}")
        print(f"  Uptime : {uptime_ms} ms")
    else:
        print("  RESULT : FAIL")
        print("  No heartbeat received — is ESP32 connected?")
        print("  Make sure the firmware is flashed and the device is online.")
    print("=" * 60)

    raise SystemExit(0 if heartbeat_received else 1)
