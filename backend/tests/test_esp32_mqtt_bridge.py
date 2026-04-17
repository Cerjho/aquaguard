import json
import uuid

from runtime_status import get_esp32_status
from services.esp32_mqtt_bridge import ingest_device_status_payload


def test_ingest_device_status_payload_updates_runtime_heartbeat():
    device_id = f"ESP32_TEST_{uuid.uuid4()}"
    payload = {
        'device_id': device_id,
        'status': 'online',
        'uptime_ms': 321000,
    }

    handled = ingest_device_status_payload(json.dumps(payload).encode('utf-8'))

    assert handled is True
    status = get_esp32_status()
    assert status['device_id'] == device_id
    assert status['status'] == 'online'
    assert status['uptime_ms'] == 321000
    assert status['last_heartbeat_at'] is not None
    assert status['heartbeat_age_seconds'] is not None


def test_ingest_device_status_payload_rejects_missing_device_id():
    handled = ingest_device_status_payload(
        json.dumps({'status': 'online', 'uptime_ms': 123}).encode('utf-8')
    )

    assert handled is False


def test_ingest_device_status_payload_honors_explicit_offline_status():
    device_id = f"ESP32_TEST_{uuid.uuid4()}"
    payload = {
        'device_id': device_id,
        'status': 'offline',
        'uptime_ms': 654321,
    }

    handled = ingest_device_status_payload(json.dumps(payload).encode('utf-8'))

    assert handled is True
    status = get_esp32_status()
    assert status['device_id'] == device_id
    assert status['status'] == 'offline'
