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


def test_refresh_revokes_previous_refresh_token(client):
    login = client.post('/api/v1/auth/login', json={
        'username': 'guard', 'password': 'guardpass'
    })
    refresh = login.get_json()['refresh_token']

    first = client.post('/api/v1/auth/refresh',
                        headers={'Authorization': f'Bearer {refresh}'})
    assert first.status_code == 200
    second = client.post('/api/v1/auth/refresh',
                         headers={'Authorization': f'Bearer {refresh}'})
    assert second.status_code == 401


def test_logout_revokes_access_token(client):
    login = client.post('/api/v1/auth/login', json={
        'username': 'admin', 'password': 'adminpass'
    })
    access = login.get_json()['access_token']

    logout_resp = client.post('/api/v1/auth/logout',
                              headers={'Authorization': f'Bearer {access}'})
    assert logout_resp.status_code == 200

    protected_resp = client.get('/api/v1/cameras',
                                headers={'Authorization': f'Bearer {access}'})
    assert protected_resp.status_code == 401


def test_logout(client, admin_token):
    resp = client.post('/api/v1/auth/logout',
                       headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
