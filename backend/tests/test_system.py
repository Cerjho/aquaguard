from datetime import datetime, timedelta, timezone


def test_system_status_requires_auth(client):
    resp = client.get('/api/v1/system/status')
    assert resp.status_code == 401


def test_heartbeat_updates_esp32_status(client, admin_token):
    heartbeat = client.post('/api/v1/system/heartbeat', json={
        'device_id': 'ESP32_AquaGuard_01',
        'status': 'online',
        'uptime_ms': 123456,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }, headers={'X-API-Key': 'test-internal-api-key'})
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


def test_heartbeat_rejects_missing_api_key(client):
    heartbeat = client.post('/api/v1/system/heartbeat', json={
        'device_id': 'ESP32_AquaGuard_01',
        'status': 'online',
    })
    assert heartbeat.status_code == 401
    assert heartbeat.get_json()['error'] == 'Unauthorized'


def test_heartbeat_explicit_offline_status_overrides_fresh_timestamp(client, admin_token):
    heartbeat = client.post('/api/v1/system/heartbeat', json={
        'device_id': 'ESP32_AquaGuard_01',
        'status': 'offline',
        'uptime_ms': 123456,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }, headers={'X-API-Key': 'test-internal-api-key'})
    assert heartbeat.status_code == 200

    status = client.get('/api/v1/system/status',
                        headers={'Authorization': f'Bearer {admin_token}'})
    assert status.status_code == 200
    payload = status.get_json()
    assert payload['esp32']['status'] == 'offline'


def test_heartbeat_stale_timeout_transitions_to_offline(client, admin_token, monkeypatch):
    monkeypatch.setenv('ESP32_HEARTBEAT_STALE_THRESHOLD_SECONDS', '1')
    old_timestamp = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()

    heartbeat = client.post('/api/v1/system/heartbeat', json={
        'device_id': 'ESP32_AquaGuard_01',
        'status': 'online',
        'uptime_ms': 123456,
        'timestamp': old_timestamp,
    }, headers={'X-API-Key': 'test-internal-api-key'})
    assert heartbeat.status_code == 200

    status = client.get('/api/v1/system/status',
                        headers={'Authorization': f'Bearer {admin_token}'})
    assert status.status_code == 200
    payload = status.get_json()
    assert payload['esp32']['status'] == 'offline'
    assert payload['esp32']['heartbeat_age_seconds'] >= 1


def test_system_status_contains_subsystem_freshness_and_health(client, admin_token):
    status = client.get('/api/v1/system/status',
                        headers={'Authorization': f'Bearer {admin_token}'})
    assert status.status_code == 200
    payload = status.get_json()

    assert payload.get('generated_at')
    assert 'subsystems' in payload
    subsystems = payload['subsystems']
    assert 'detection_engine' in subsystems
    assert 'cameras' in subsystems
    assert 'esp32' in subsystems

    detection_engine = subsystems['detection_engine']
    assert 'health' in detection_engine
    assert 'freshness_seconds' in detection_engine
    assert 'stale_threshold_seconds' in detection_engine

    cameras = subsystems['cameras']
    assert {'total', 'online', 'offline'} <= set(cameras.keys())

    esp32 = subsystems['esp32']
    assert 'freshness_seconds' in esp32
    assert 'last_heartbeat_at' in esp32
