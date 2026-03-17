"""
backend/tests/test_cameras.py
------------------------------
Unit tests for the cameras blueprint.

Covers:
  - GET    /api/v1/cameras                    — list cameras (jwt required)
  - POST   /api/v1/cameras                    — create camera (admin only)
  - POST   /api/v1/cameras                    — lifeguard → 403
  - PUT    /api/v1/cameras/<zone_id>          — update camera (admin only)
  - DELETE /api/v1/cameras/<zone_id>          — soft delete (admin only)
  - DELETE /api/v1/cameras/<zone_id>          — lifeguard → 403
"""

import uuid

import pytest
from tests.conftest import auth_header


def _unique_zone_id():
    return f'zone_test_{uuid.uuid4().hex[:8]}'


def _camera_payload(zone_id=None) -> dict:
    zone_id = zone_id or _unique_zone_id()
    return {
        'zone_id': zone_id,
        'zone_name': f'Test Pool {zone_id}',
        'rtsp_url': f'rtsp://192.168.1.99/stream_{zone_id}',
        'location_description': 'Test camera',
        'frame_rate': 30,
        'resolution': '1280x720',
    }


class TestListCameras:
    def test_list_requires_auth(self, client, app):
        """GET /cameras without token returns 401."""
        with app.app_context():
            resp = client.get('/api/v1/cameras')
        assert resp.status_code in (401, 422)

    def test_list_cameras_success(self, client, app, admin_token):
        """Authenticated GET returns {cameras: [...]}."""
        with app.app_context():
            resp = client.get(
                '/api/v1/cameras',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'cameras' in data
        assert isinstance(data['cameras'], list)


class TestCreateCamera:
    def test_create_camera_admin_success(self, client, app, admin_token):
        """Admin can create a new camera zone."""
        payload = _camera_payload()
        with app.app_context():
            resp = client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['zone_id'] == payload['zone_id']
        assert data['is_active'] is True

    def test_create_camera_lifeguard_forbidden(
        self, client, app, lifeguard_token
    ):
        """Lifeguard role gets 403 on POST /cameras."""
        with app.app_context():
            resp = client.post(
                '/api/v1/cameras',
                json=_camera_payload(),
                headers=auth_header(lifeguard_token),
            )
        assert resp.status_code == 403

    def test_create_camera_missing_field(self, client, app, admin_token):
        """Missing required field returns 400."""
        payload = _camera_payload()
        del payload['rtsp_url']
        with app.app_context():
            resp = client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 400

    def test_create_camera_duplicate_zone_id(self, client, app, admin_token):
        """Duplicate zone_id returns 400."""
        payload = _camera_payload()
        with app.app_context():
            client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
            resp = client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 400


class TestUpdateCamera:
    def test_update_camera_success(self, client, app, admin_token):
        """Admin can update camera zone_name."""
        payload = _camera_payload()
        with app.app_context():
            client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
            resp = client.put(
                f'/api/v1/cameras/{payload["zone_id"]}',
                json={'zone_name': 'Updated Pool Name'},
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert resp.get_json()['zone_name'] == 'Updated Pool Name'

    def test_update_camera_not_found(self, client, app, admin_token):
        """Non-existent zone_id returns 404."""
        with app.app_context():
            resp = client.put(
                '/api/v1/cameras/zone_does_not_exist',
                json={'zone_name': 'x'},
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 404

    def test_update_camera_lifeguard_forbidden(
        self, client, app, lifeguard_token
    ):
        """Lifeguard gets 403 on PUT."""
        with app.app_context():
            resp = client.put(
                '/api/v1/cameras/any_zone',
                json={'zone_name': 'x'},
                headers=auth_header(lifeguard_token),
            )
        assert resp.status_code == 403


class TestDeleteCamera:
    def test_delete_camera_soft_deletes(self, client, app, admin_token):
        """Admin soft-delete sets is_active=False."""
        payload = _camera_payload()
        with app.app_context():
            client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
            resp = client.delete(
                f'/api/v1/cameras/{payload["zone_id"]}',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert resp.get_json()['zone_id'] == payload['zone_id']

    def test_deleted_camera_not_in_list(self, client, app, admin_token):
        """Soft-deleted camera does not appear in GET /cameras."""
        payload = _camera_payload()
        with app.app_context():
            client.post(
                '/api/v1/cameras',
                json=payload,
                headers=auth_header(admin_token),
            )
            client.delete(
                f'/api/v1/cameras/{payload["zone_id"]}',
                headers=auth_header(admin_token),
            )
            list_resp = client.get(
                '/api/v1/cameras',
                headers=auth_header(admin_token),
            )
        cameras = list_resp.get_json()['cameras']
        zone_ids = [c['zone_id'] for c in cameras]
        assert payload['zone_id'] not in zone_ids

    def test_delete_camera_lifeguard_forbidden(
        self, client, app, lifeguard_token
    ):
        """Lifeguard gets 403 on DELETE."""
        with app.app_context():
            resp = client.delete(
                '/api/v1/cameras/any_zone',
                headers=auth_header(lifeguard_token),
            )
        assert resp.status_code == 403
