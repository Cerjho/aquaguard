"""
backend/tests/test_reports.py
------------------------------
Unit tests for the reports blueprint.

Covers:
  - GET /api/v1/reports/summary — default window (last 7 days)
  - GET /api/v1/reports/summary — custom from/to date range
  - GET /api/v1/reports/summary — invalid group_by falls back to 'day'
  - GET /api/v1/reports/summary — no token returns 401
"""

from datetime import datetime, timedelta, timezone

import pytest
from tests.conftest import auth_header


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class TestReportsSummary:
    def test_summary_requires_auth(self, client, app):
        """GET /reports/summary without token returns 401."""
        with app.app_context():
            resp = client.get('/api/v1/reports/summary')
        assert resp.status_code in (401, 422)

    def test_summary_default_window(self, client, app, admin_token):
        """Default summary returns required keys."""
        with app.app_context():
            resp = client.get(
                '/api/v1/reports/summary',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'total_detections' in data
        assert 'confirmed_alerts' in data
        assert 'false_positives_suppressed' in data
        assert 'by_zone' in data
        assert isinstance(data['by_zone'], list)
        assert 'from' in data
        assert 'to' in data
        assert data['group_by'] == 'day'

    def test_summary_custom_date_range(self, client, app, admin_token):
        """Custom from/to range is respected."""
        now = datetime.now(timezone.utc)
        from_str = _iso(now - timedelta(days=1))
        to_str = _iso(now)
        with app.app_context():
            resp = client.get(
                f'/api/v1/reports/summary?from={from_str}&to={to_str}',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['total_detections'] >= 0
        assert data['confirmed_alerts'] >= 0
        assert data['confirmed_alerts'] <= data['total_detections']

    def test_summary_invalid_group_by_defaults_to_day(
        self, client, app, admin_token
    ):
        """Invalid group_by param is silently coerced to 'day'."""
        with app.app_context():
            resp = client.get(
                '/api/v1/reports/summary?group_by=invalid_value',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert resp.get_json()['group_by'] == 'day'

    def test_summary_group_by_hour(self, client, app, admin_token):
        """group_by=hour is accepted."""
        with app.app_context():
            resp = client.get(
                '/api/v1/reports/summary?group_by=hour',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert resp.get_json()['group_by'] == 'hour'

    def test_summary_group_by_week(self, client, app, admin_token):
        """group_by=week is accepted."""
        with app.app_context():
            resp = client.get(
                '/api/v1/reports/summary?group_by=week',
                headers=auth_header(admin_token),
            )
        assert resp.status_code == 200
        assert resp.get_json()['group_by'] == 'week'

    def test_summary_counts_are_non_negative(self, client, app, admin_token):
        """All numeric summary fields must be non-negative integers."""
        with app.app_context():
            resp = client.get(
                '/api/v1/reports/summary',
                headers=auth_header(admin_token),
            )
        data = resp.get_json()
        assert data['total_detections'] >= 0
        assert data['confirmed_alerts'] >= 0
        assert data['false_positives_suppressed'] >= 0

    def test_summary_by_zone_structure(self, client, app, admin_token, db):
        """by_zone entries have required fields."""
        # Create at least one event to ensure by_zone is populated
        from datetime import timezone as tz

        with app.app_context():
            client.post(
                '/api/v1/events',
                json={
                    'zone_id': 'zone_report_test',
                    'track_id': 1,
                    'confidence_score': 0.8,
                    'behavior_flags': {},
                    'alert_triggered': False,
                    'detected_at': datetime.now(tz.utc).isoformat(),
                },
            )
            resp = client.get(
                '/api/v1/reports/summary',
                headers=auth_header(admin_token),
            )
        data = resp.get_json()
        for zone_entry in data['by_zone']:
            assert 'zone_id' in zone_entry
            assert 'zone_name' in zone_entry
            assert 'detections' in zone_entry
            assert 'alerts' in zone_entry
