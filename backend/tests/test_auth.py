def test_login_success(client):
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin', 'password': 'adminpass'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    assert 'refresh_token' in data
    assert data['user']['role'] == 'admin'


def test_login_wrong_password(client):
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin', 'password': 'wrongpass'
    })
    assert resp.status_code == 401


def test_login_missing_fields(client):
    resp = client.post('/api/v1/auth/login', json={'username': 'admin'})
    assert resp.status_code == 400


def test_refresh(client, guard_token):
    # Get a refresh token
    resp = client.post('/api/v1/auth/login', json={
        'username': 'guard', 'password': 'guardpass'
    })
    refresh = resp.get_json()['refresh_token']
    resp2 = client.post('/api/v1/auth/refresh',
                        headers={'Authorization': f'Bearer {refresh}'})
    assert resp2.status_code == 200
    assert 'access_token' in resp2.get_json()


def test_logout(client):
    resp = client.post('/api/v1/auth/logout')
    assert resp.status_code == 200
