def test_list_cameras_requires_auth(client):
    resp = client.get('/api/v1/cameras')
    assert resp.status_code == 401


def test_list_cameras(client, admin_token):
    resp = client.get('/api/v1/cameras',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


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
