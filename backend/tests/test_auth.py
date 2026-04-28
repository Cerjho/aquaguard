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
        'username': 'lifeguard', 'password': 'guardpass'
    })
    refresh = resp.get_json()['refresh_token']
    resp2 = client.post('/api/v1/auth/refresh',
                        headers={'Authorization': f'Bearer {refresh}'})
    assert resp2.status_code == 200
    assert 'access_token' in resp2.get_json()


def test_refresh_revokes_previous_refresh_token(client):
    login = client.post('/api/v1/auth/login', json={
        'username': 'lifeguard', 'password': 'guardpass'
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
    data = resp.get_json()['data']
    assert 'user' in data
    assert data['user']['username'] == 'admin'
    assert data['user']['role'] == 'admin'


def test_me_endpoint_without_token(client):
    """Test that /me returns 401 when no token is provided."""
    resp = client.get('/api/v1/auth/me')
    assert resp.status_code == 401


def test_me_endpoint_with_invalid_token(client):
    """Test that /me returns 401 when token is invalid."""
    resp = client.get('/api/v1/auth/me',
                      headers={'Authorization': 'Bearer invalid-token'})
    assert resp.status_code == 401


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


# ---------------------------------------------------------------------------
# change-password endpoint tests
# ---------------------------------------------------------------------------

def test_change_password_success(client, guard_token):
    """Authenticated user can change their password with correct current password."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'guardpass', 'new_password': 'NewSecure@99'},
        headers={'Authorization': f'Bearer {guard_token}'},
    )
    assert resp.status_code == 200
    assert 'updated' in resp.get_json().get('message', '').lower()

    # Restore the password so subsequent tests using guard_token don't fail
    client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'NewSecure@99', 'new_password': 'guardpass'},
        headers={'Authorization': f'Bearer {guard_token}'},
    )


def test_change_password_wrong_current(client, admin_token):
    """Returns 401 when current password is incorrect."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'wrongpassword', 'new_password': 'NewSecure@99'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 401
    assert 'incorrect' in resp.get_json().get('error', '').lower()


def test_change_password_too_short(client, admin_token):
    """Returns 400 when new password is shorter than 8 characters."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'adminpass', 'new_password': 'short'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 400
    assert '8' in resp.get_json().get('error', '')


def test_change_password_same_as_current(client, admin_token):
    """Returns 400 when new password is identical to the current password."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'adminpass', 'new_password': 'adminpass'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 400
    assert 'differ' in resp.get_json().get('error', '').lower()


def test_change_password_missing_fields(client, admin_token):
    """Returns 400 when required fields are missing."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'adminpass'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 400


def test_change_password_unauthenticated(client):
    """Returns 401 when no JWT is provided."""
    resp = client.post(
        '/api/v1/auth/change-password',
        json={'current_password': 'adminpass', 'new_password': 'NewSecure@99'},
    )
    assert resp.status_code == 401
