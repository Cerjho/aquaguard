"""
backend/tests/test_alerts.py
-----------------------------
Unit tests for the alerts blueprint.

Covers:
  - GET  /api/v1/alerts                         — list alerts
  - GET  /api/v1/alerts?status=unacknowledged   — filter by status
  - POST /api/v1/alerts/<alert_id>/acknowledge  — acknowledge alert
  - POST /api/v1/alerts/<alert_id>/acknowledge  — already acknowledged (409)
  - POST /api/v1/alerts/<bad_id>/acknowledge    — not found (404)
"""

import uuid
from datetime import datetime, timezone

import pytest
from tests.conftest import auth_header


def _create_event_and_alert(client, app, zone_id=None):
    """Helper: POST an event with alert_triggered=True and return alert_id."""
    zone_id = zone_id or f'zone_alert_{uuid.uuid4().hex[:8]}'
    with app.app_context():
        resp = client.post(
            '/api/v1/events',
            json={
                'zone_id': zone_id,
                'track_id': 1,
                'confidence_score': 0.9,
                'behavior_flags': {},
                'alert_triggered': True,
                'detected_at': datetime.now(timezone.utc).isoformat(),
            },
        )
    data = resp.get_json()
    return data['alert']['alert_id'], zone_id


class TestListAlerts:
    def test_list_alerts_requires_auth(self, client, app):
        """GET /alerts without token returns 401."""
        with app.app_context():
            resp = client.get('/api/v1/alerts')
        assert resp.status_code in (401, 422)

    def test_list_alerts_returns_list(self, client, app, db, admin_token):
        """Authenticated GET returns list of alerts."""
        with app.app_context():
            resp = client.get(
                '/api/v1/alerts',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'alerts' in data
        assert isinstance(data['alerts'], list)

    def test_list_alerts_filter_unacknowledged(self, client, app, db, admin_token):
        """?status=unacknowledged returns only unacknowledged alerts."""
        # Create a fresh unacknowledged alert
        _create_event_and_alert(client, app)
        with app.app_context():
            resp = client.get(
                '/api/v1/alerts?status=unacknowledged',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        for alert in data['alerts']:
            assert alert['status'] == 'unacknowledged'


class TestAcknowledgeAlert:
    def test_acknowledge_alert_success(self, client, app, db, admin_token):
        """Acknowledge a valid unacknowledged alert — returns 200."""
        alert_id, _ = _create_event_and_alert(client, app)
        with app.app_context():
            resp = client.post(
                f'/api/v1/alerts/{alert_id}/acknowledge',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'acknowledged'
        assert data['acknowledged_at'] is not None
        assert data['acknowledged_by'] is not None

    def test_acknowledge_sets_correct_user(
        self, client, app, db, lifeguard_token, lifeguard_user
    ):
        """acknowledged_by should match the JWT identity."""
        alert_id, _ = _create_event_and_alert(client, app)
        with app.app_context():
            resp = client.post(
                f'/api/v1/alerts/{alert_id}/acknowledge',
                headers=auth_header(lifeguard_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['acknowledged_by'] == lifeguard_user.id

    def test_acknowledge_with_notes(self, client, app, db, admin_token):
        """Notes field is stored when provided."""
        alert_id, _ = _create_event_and_alert(client, app)
        with app.app_context():
            resp = client.post(
                f'/api/v1/alerts/{alert_id}/acknowledge',
                json={'notes': 'False alarm — swimmer was resting'},
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert 'False alarm' in resp.get_json()['notes']

    def test_acknowledge_already_acknowledged(self, client, app, db, admin_token):
        """Acknowledging an already-acknowledged alert returns 409."""
        alert_id, _ = _create_event_and_alert(client, app)
        with app.app_context():
            # First acknowledgement
            client.post(
                f'/api/v1/alerts/{alert_id}/acknowledge',
                headers=auth_header(admin_token),
            )
            # Second acknowledgement
            resp = client.post(
                f'/api/v1/alerts/{alert_id}/acknowledge',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 409

    def test_acknowledge_not_found(self, client, app, db, admin_token):
        """Non-existent alert_id returns 404."""
        with app.app_context():
            resp = client.post(
                f'/api/v1/alerts/{uuid.uuid4()}/acknowledge',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 404

    def test_acknowledge_requires_auth(self, client, app):
        """No token returns 401."""
        with app.app_context():
            resp = client.post(f'/api/v1/alerts/{uuid.uuid4()}/acknowledge')
        assert resp.status_code in (401, 422)
