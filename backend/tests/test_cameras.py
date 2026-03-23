import os

import routes.cameras as cameras_routes


def test_list_cameras_requires_auth(client):
    resp = client.get('/api/v1/cameras')
    assert resp.status_code == 401


def test_internal_list_cameras_requires_api_key(client):
    resp = client.get('/api/v1/internal/cameras')
    assert resp.status_code == 401
    assert resp.get_json()['error'] == 'Unauthorized'


def test_internal_list_cameras_with_valid_api_key(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_internal_active',
        'zone_name': 'Internal Active',
        'rtsp_url':  'rtsp://localhost/internal-active',
    }, headers={'Authorization': f'Bearer {admin_token}'})

    resp = client.get(
        '/api/v1/internal/cameras',
        headers={'X-API-Key': 'test-internal-api-key'}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'cameras' in data
    assert isinstance(data['cameras'], list)
    camera = next((c for c in data['cameras'] if c['zone_id'] == 'zone_internal_active'), None)
    assert camera is not None
    assert camera['rtsp_url'] == 'rtsp://localhost/internal-active'
    assert 'frame_rate' in camera


def test_internal_list_cameras_excludes_inactive(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_internal_inactive',
        'zone_name': 'Internal Inactive',
        'rtsp_url':  'rtsp://localhost/internal-inactive',
    }, headers={'Authorization': f'Bearer {admin_token}'})
    client.delete(
        '/api/v1/cameras/zone_internal_inactive',
        headers={'Authorization': f'Bearer {admin_token}'}
    )

    resp = client.get(
        '/api/v1/internal/cameras',
        headers={'X-API-Key': 'test-internal-api-key'}
    )
    assert resp.status_code == 200
    zone_ids = [c['zone_id'] for c in resp.get_json()['cameras']]
    assert 'zone_internal_inactive' not in zone_ids


def test_list_cameras(client, admin_token):
    resp = client.get('/api/v1/cameras',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_list_cameras_include_inactive(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_inactive_1',
        'zone_name': 'Inactive Zone',
        'rtsp_url':  'rtsp://localhost/inactive1',
    }, headers={'Authorization': f'Bearer {admin_token}'})
    client.delete('/api/v1/cameras/zone_inactive_1',
                  headers={'Authorization': f'Bearer {admin_token}'})

    default_list = client.get('/api/v1/cameras',
                              headers={'Authorization': f'Bearer {admin_token}'})
    assert default_list.status_code == 200
    assert 'zone_inactive_1' not in [c['zone_id'] for c in default_list.get_json()]

    include_all = client.get('/api/v1/cameras?include_inactive=true',
                             headers={'Authorization': f'Bearer {admin_token}'})
    assert include_all.status_code == 200
    rows = include_all.get_json()
    match = next((c for c in rows if c['zone_id'] == 'zone_inactive_1'), None)
    assert match is not None
    assert match['is_active'] is False


def test_create_camera_admin(client, admin_token):
    resp = client.post('/api/v1/cameras', json={
        'zone_id':   'zone_test',
        'zone_name': 'Test Zone',
        'rtsp_url':  'rtsp://localhost/test',
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['zone_id'] == 'zone_test'


def test_create_camera_forbidden_for_guard(client, guard_token):
    resp = client.post('/api/v1/cameras', json={
        'zone_id':   'zone_guard',
        'zone_name': 'Guard Zone',
        'rtsp_url':  'rtsp://localhost/guard',
    }, headers={'Authorization': f'Bearer {guard_token}'})
    assert resp.status_code == 403


def test_create_camera_duplicate(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id': 'zone_dup', 'zone_name': 'Dup', 'rtsp_url': 'rtsp://x'
    }, headers={'Authorization': f'Bearer {admin_token}'})
    resp = client.post('/api/v1/cameras', json={
        'zone_id': 'zone_dup', 'zone_name': 'Dup2', 'rtsp_url': 'rtsp://x2'
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 409


def test_update_camera(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id': 'zone_upd', 'zone_name': 'Old Name', 'rtsp_url': 'rtsp://old'
    }, headers={'Authorization': f'Bearer {admin_token}'})

    resp = client.put('/api/v1/cameras/zone_upd', json={
        'zone_name': 'New Name'
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert resp.get_json()['zone_name'] == 'New Name'


def test_update_camera_can_toggle_is_active(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id': 'zone_toggle', 'zone_name': 'Toggle', 'rtsp_url': 'rtsp://toggle'
    }, headers={'Authorization': f'Bearer {admin_token}'})

    resp = client.put('/api/v1/cameras/zone_toggle', json={
        'is_active': False
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert resp.get_json()['is_active'] is False

    include_all = client.get('/api/v1/cameras?include_inactive=1',
                             headers={'Authorization': f'Bearer {admin_token}'})
    assert include_all.status_code == 200
    match = next((c for c in include_all.get_json() if c['zone_id'] == 'zone_toggle'), None)
    assert match is not None
    assert match['is_active'] is False


def test_update_camera_rejects_invalid_is_active_type(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id': 'zone_bad_toggle', 'zone_name': 'Bad Toggle', 'rtsp_url': 'rtsp://bad-toggle'
    }, headers={'Authorization': f'Bearer {admin_token}'})

    resp = client.put('/api/v1/cameras/zone_bad_toggle', json={
        'is_active': 'false'
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 400
    assert 'is_active must be a boolean' in resp.get_json()['error']


def test_create_camera_rejects_invalid_is_active_type(client, admin_token):
    resp = client.post('/api/v1/cameras', json={
        'zone_id':   'zone_bad_create',
        'zone_name': 'Bad Create',
        'rtsp_url':  'rtsp://localhost/bad-create',
        'is_active': 'true',
    }, headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 400
    assert 'is_active must be a boolean' in resp.get_json()['error']


def test_delete_camera(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id': 'zone_del', 'zone_name': 'Del Zone', 'rtsp_url': 'rtsp://del'
    }, headers={'Authorization': f'Bearer {admin_token}'})

    resp = client.delete('/api/v1/cameras/zone_del',
                         headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    # Should not appear in list after soft-delete
    list_resp = client.get('/api/v1/cameras',
                           headers={'Authorization': f'Bearer {admin_token}'})
    zone_ids = [c['zone_id'] for c in list_resp.get_json()]
    assert 'zone_del' not in zone_ids


def test_stream_requires_bearer_auth(client):
    resp = client.get('/api/v1/cameras/zone_missing/stream')
    assert resp.status_code == 401


def test_stream_rejects_raw_jwt_query_token(client, admin_token):
    resp = client.get('/api/v1/cameras/zone_missing/stream?token=fake-token')
    assert resp.status_code == 401

    raw_jwt = client.get(f'/api/v1/cameras/zone_01/stream?token={admin_token}')
    assert raw_jwt.status_code == 401


def test_stream_token_requires_jwt(client):
    resp = client.post('/api/v1/cameras/zone_01/stream-token')
    assert resp.status_code == 401


def test_stream_token_mint_and_use(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_01',
        'zone_name': 'Zone 1',
        'rtsp_url':  'rtsp://localhost/zone1',
    }, headers={'Authorization': f'Bearer {admin_token}'})

    mint = client.post('/api/v1/cameras/zone_01/stream-token',
                       headers={'Authorization': f'Bearer {admin_token}'})
    assert mint.status_code == 200
    token_payload = mint.get_json()
    token = token_payload['stream_token']
    assert 'expires_at' in token_payload
    assert 'ttl_seconds' in token_payload
    assert token_payload['ttl_seconds'] >= 1
    # Backward compatibility
    assert token_payload['expires_in_seconds'] == token_payload['ttl_seconds']

    os.makedirs(cameras_routes.LIVE_DIR, exist_ok=True)
    frame_path = os.path.join(cameras_routes.LIVE_DIR, 'zone_01_latest.jpg')
    with open(frame_path, 'wb') as f:
        f.write(b'\xff\xd8\xff\xd9')

    stream = client.get(f'/api/v1/cameras/zone_01/stream?token={token}')
    assert stream.status_code == 200
    assert 'multipart/x-mixed-replace' in stream.content_type


def test_stream_token_zone_mismatch_is_rejected(client, admin_token):
    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_01',
        'zone_name': 'Zone 1',
        'rtsp_url':  'rtsp://localhost/zone1',
    }, headers={'Authorization': f'Bearer {admin_token}'})

    client.post('/api/v1/cameras', json={
        'zone_id':   'zone_02',
        'zone_name': 'Zone 2',
        'rtsp_url':  'rtsp://localhost/zone2',
    }, headers={'Authorization': f'Bearer {admin_token}'})

    mint = client.post('/api/v1/cameras/zone_01/stream-token',
                       headers={'Authorization': f'Bearer {admin_token}'})
    token = mint.get_json()['stream_token']

    mismatch = client.get(f'/api/v1/cameras/zone_02/stream?token={token}')
    assert mismatch.status_code == 401
