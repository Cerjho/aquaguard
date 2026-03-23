from flask_jwt_extended import decode_token


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


def test_me_endpoint_with_valid_token(client, admin_token):
    """Test that /me returns the current user's profile when authenticated."""
    resp = client.get('/api/v1/auth/me',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'user' in data
    assert data['user']['username'] == 'admin'
    assert data['user']['role'] == 'admin'


def test_me_endpoint_without_token(client):
    """Test that /me returns 401 when no token is provided."""
    resp = client.get('/api/v1/auth/me')
    assert resp.status_code == 401


def test_me_endpoint_with_invalid_token(client):
    """Test that /me returns 422 when token is invalid."""
    resp = client.get('/api/v1/auth/me',
                      headers={'Authorization': 'Bearer invalid-token'})
    assert resp.status_code == 422


def test_login_with_remember_me_false(client):
    """Test that login without remember_me uses default token expiration."""
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass',
        'remember_me': False
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    assert 'refresh_token' in data
    assert data['user']['username'] == 'admin'
    access_payload = decode_token(data['access_token'])
    refresh_payload = decode_token(data['refresh_token'])
    assert 3500 <= (access_payload['exp'] - access_payload['iat']) <= 3700
    assert 604000 <= (refresh_payload['exp'] - refresh_payload['iat']) <= 605000


def test_login_with_remember_me_true(client):
    """Test that login with remember_me=true uses 30-day token expiration."""
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass',
        'remember_me': True
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    assert 'refresh_token' in data
    assert data['user']['username'] == 'admin'
    access_payload = decode_token(data['access_token'])
    refresh_payload = decode_token(data['refresh_token'])
    assert 2590000 <= (access_payload['exp'] - access_payload['iat']) <= 2600000
    assert 2590000 <= (refresh_payload['exp'] - refresh_payload['iat']) <= 2600000


def test_login_remember_me_defaults_to_false(client):
    """Test that remember_me defaults to False when not provided."""
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    access_payload = decode_token(data['access_token'])
    assert 3500 <= (access_payload['exp'] - access_payload['iat']) <= 3700


def test_login_rejects_non_boolean_remember_me(client):
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass',
        'remember_me': 'false',
    })
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'remember_me must be a boolean'
