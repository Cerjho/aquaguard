"""
backend/tests/test_events.py
-----------------------------
Unit tests for the events blueprint.

Covers:
  - POST /api/v1/events — valid event (no alert)
  - POST /api/v1/events — alert_triggered=True creates Alert + emits
  - POST /api/v1/events — missing required fields (400)
  - GET  /api/v1/events — list with filters (jwt required)
  - GET  /api/v1/events — no token returns 401
"""

import uuid
from datetime import datetime, timezone

import pytest
from tests.conftest import auth_header


def _event_payload(**overrides) -> dict:
    """Return a minimal valid event POST body."""
    base = {
        'zone_id': 'zone_test_01',
        'track_id': 42,
        'confidence_score': 0.85,
        'behavior_flags': {'vertical_orientation': True, 'arms_elevated': False},
        'alert_triggered': False,
        'detected_at': datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


class TestPostEvent:
    def test_post_event_success(self, client, app, db):
        """Valid event payload returns 201 with event data."""
        with app.app_context():
            resp = client.post('/api/v1/events', json=_event_payload())
        assert resp.status_code == 201
        data = resp.get_json()
        assert 'event' in data
        assert data['event']['zone_id'] == 'zone_test_01'
        assert data['event']['confidence_score'] == 0.85
        assert data['alert'] is None

    def test_post_event_with_alert_triggered(self, client, app, db):
        """alert_triggered=True creates an Alert record and returns it."""
        with app.app_context():
            resp = client.post(
                '/api/v1/events',
                json=_event_payload(alert_triggered=True),
            )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['alert'] is not None
        assert data['alert']['status'] == 'unacknowledged'
        assert data['alert']['zone_id'] == 'zone_test_01'

    def test_post_event_missing_zone_id(self, client, app):
        """Missing zone_id returns 400."""
        with app.app_context():
            payload = _event_payload()
            del payload['zone_id']
            resp = client.post('/api/v1/events', json=payload)
        assert resp.status_code == 400
        assert 'error' in resp.get_json()

    def test_post_event_missing_confidence_score(self, client, app):
        """Missing confidence_score returns 400."""
        with app.app_context():
            payload = _event_payload()
            del payload['confidence_score']
            resp = client.post('/api/v1/events', json=payload)
        assert resp.status_code == 400

    def test_post_event_invalid_detected_at(self, client, app):
        """Invalid detected_at format returns 400."""
        with app.app_context():
            resp = client.post(
                '/api/v1/events',
                json=_event_payload(detected_at='not-a-date'),
            )
        assert resp.status_code == 400

    def test_post_event_empty_body(self, client, app):
        """Empty body returns 400."""
        with app.app_context():
            resp = client.post('/api/v1/events', json={})
        assert resp.status_code == 400


class TestGetEvents:
    def test_get_events_requires_auth(self, client, app):
        """GET /events without token returns 401."""
        with app.app_context():
            resp = client.get('/api/v1/events')
        assert resp.status_code in (401, 422)

    def test_get_events_returns_list(self, client, app, db, admin_token):
        """Authenticated GET returns paginated list."""
        with app.app_context():
            resp = client.get(
                '/api/v1/events',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'items' in data
        assert 'total' in data
        assert 'page' in data
        assert 'limit' in data

    def test_get_events_filter_by_zone(self, client, app, db, admin_token):
        """zone_id filter returns only matching events."""
        # First create an event in a unique zone
        unique_zone = f'zone_filter_{uuid.uuid4().hex[:8]}'
        with app.app_context():
            client.post('/api/v1/events', json=_event_payload(zone_id=unique_zone))
            resp = client.get(
                f'/api/v1/events?zone_id={unique_zone}',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        for item in data['items']:
            assert item['zone_id'] == unique_zone

    def test_get_events_filter_by_alert_triggered(self, client, app, db, admin_token):
        """alert_triggered=true filter returns only alert events."""
        with app.app_context():
            resp = client.get(
                '/api/v1/events?alert_triggered=true',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        for item in data['items']:
            assert item['alert_triggered'] is True

    def test_get_events_pagination(self, client, app, db, admin_token):
        """page and limit params are respected."""
        with app.app_context():
            resp = client.get(
                '/api/v1/events?page=1&limit=2',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['page'] == 1
        assert data['limit'] == 2
        assert len(data['items']) <= 2
