from datetime import datetime, timezone


def test_system_status_requires_auth(client):
    resp = client.get('/api/v1/system/status')
    assert resp.status_code == 401


def test_heartbeat_updates_esp32_status(client, admin_token):
    heartbeat = client.post('/api/v1/system/heartbeat', json={
        'device_id': 'ESP32_AquaGuard_01',
        'status': 'online',
        'uptime_ms': 123456,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    assert heartbeat.status_code == 200

    status = client.get('/api/v1/system/status',
                        headers={'Authorization': f'Bearer {admin_token}'})
    assert status.status_code == 200
    payload = status.get_json()
    assert 'esp32' in payload
    assert payload['esp32']['device_id'] == 'ESP32_AquaGuard_01'
    assert payload['esp32']['status'] == 'online'
    assert payload['esp32']['uptime_ms'] == 123456
    assert payload['esp32']['last_heartbeat_at'] is not None
