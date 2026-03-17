"""
backend/tests/test_auth.py
---------------------------
Unit tests for the authentication blueprint.

Covers:
  - POST /api/v1/auth/login   — success
  - POST /api/v1/auth/login   — wrong password (401)
  - POST /api/v1/auth/login   — missing fields (400)
  - POST /api/v1/auth/refresh — success
  - POST /api/v1/auth/logout  — success
"""

import pytest
from tests.conftest import auth_header


class TestLogin:
    def test_login_success(self, client, admin_user, app):
        """Valid credentials return 200 with access_token and refresh_token."""
        with app.app_context():
            resp = client.post(
                '/api/v1/auth/login',
                json={'username': 'test_admin', 'password': 'admin_pass'},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['user']['username'] == 'test_admin'
        assert data['user']['role'] == 'admin'

    def test_login_wrong_password(self, client, admin_user, app):
        """Wrong password returns 401."""
        with app.app_context():
            resp = client.post(
                '/api/v1/auth/login',
                json={'username': 'test_admin', 'password': 'wrongpassword'},
            )
        assert resp.status_code == 401
        assert 'error' in resp.get_json()

    def test_login_unknown_user(self, client, app):
        """Unknown username returns 401."""
        with app.app_context():
            resp = client.post(
                '/api/v1/auth/login',
                json={'username': 'nobody', 'password': 'anything'},
            )
        assert resp.status_code == 401

    def test_login_missing_username(self, client, app):
        """Missing username returns 400."""
        with app.app_context():
            resp = client.post(
                '/api/v1/auth/login',
                json={'password': 'admin_pass'},
            )
        assert resp.status_code == 400
        assert 'error' in resp.get_json()

    def test_login_missing_password(self, client, app):
        """Missing password returns 400."""
        with app.app_context():
            resp = client.post(
                '/api/v1/auth/login',
                json={'username': 'test_admin'},
            )
        assert resp.status_code == 400

    def test_login_empty_body(self, client, app):
        """Empty body returns 400."""
        with app.app_context():
            resp = client.post('/api/v1/auth/login', json={})
        assert resp.status_code == 400


class TestRefresh:
    def test_refresh_success(self, client, app, admin_user):
        """Valid refresh token returns new access token."""
        with app.app_context():
            # First login to get refresh token
            login_resp = client.post(
                '/api/v1/auth/login',
                json={'username': 'test_admin', 'password': 'admin_pass'},
            )
            refresh_token = login_resp.get_json()['refresh_token']

            resp = client.post(
                '/api/v1/auth/refresh',
                headers=auth_header(refresh_token),
            )
        assert resp.status_code == 200
        assert 'access_token' in resp.get_json()

    def test_refresh_without_token(self, client, app):
        """No token → 401/422."""
        with app.app_context():
            resp = client.post('/api/v1/auth/refresh')
        assert resp.status_code in (401, 422)


class TestLogout:
    def test_logout_returns_200(self, client, app):
        """Logout always returns 200."""
        with app.app_context():
            resp = client.post('/api/v1/auth/logout')
        assert resp.status_code == 200
        assert resp.get_json()['message'] == 'Logged out'
