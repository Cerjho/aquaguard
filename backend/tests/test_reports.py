from datetime import datetime


def _post_event(client, zone_id, detected_at, alert_triggered=False, confidence=0.7):
    return client.post('/api/v1/events', json={
        'zone_id': zone_id,
        'track_id': 1,
        'confidence_score': confidence,
        'behavior_flags': {'vertical': True},
        'alert_triggered': alert_triggered,
        'detected_at': detected_at,
    })


def test_summary_requires_auth(client):
    resp = client.get('/api/v1/reports/summary')
    assert resp.status_code == 401


def test_summary(client, admin_token):
    resp = client.get('/api/v1/reports/summary',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.get_json()['data']
    assert 'total_detections' in data
    assert 'confirmed_alerts' in data
    assert 'false_positives_suppressed' in data
    assert 'by_zone' in data
    assert isinstance(data['by_zone'], list)


def test_summary_date_range(client, admin_token):
    _post_event(client, 'zone_rep_1', '2025-02-01T10:00:00', False)
    _post_event(client, 'zone_rep_1', '2025-02-02T10:00:00', True)

    resp = client.get(
        '/api/v1/reports/summary?from=2025-02-01T00:00:00&to=2025-02-02T23:59:59',
        headers={'Authorization': f'Bearer {admin_token}'}
    )
    assert resp.status_code == 200
    data = resp.get_json()['data']
    assert 'total_detections' in data
    assert 'by_zone' in data


def test_summary_invalid_dates(client, admin_token):
    # Invalid dates should be ignored gracefully — not crash
    resp = client.get(
        '/api/v1/reports/summary?from=bad-date&to=also-bad',
        headers={'Authorization': f'Bearer {admin_token}'}
    )
    assert resp.status_code == 200


def test_summary_daily_grouping_keeps_existing_contract(client, admin_token):
    _post_event(client, 'zone_daily', '2025-03-01T08:00:00', False)
    _post_event(client, 'zone_daily', '2025-03-01T09:00:00', True)
    _post_event(client, 'zone_daily', '2025-03-02T09:00:00', False)

    resp = client.get(
        '/api/v1/reports/summary?group_by=day&from=2025-03-01T00:00:00&to=2025-03-02T23:59:59',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200
    data = resp.get_json()['data']

    # Existing contract preserved
    assert 'total_detections' in data
    assert 'confirmed_alerts' in data
    assert 'false_positives_suppressed' in data
    assert 'by_zone' in data

    # New grouped series
    assert 'daily' in data
    assert isinstance(data['daily'], list)
    assert len(data['daily']) >= 2
    first_item = data['daily'][0]
    assert {'date', 'detections', 'alerts'} <= set(first_item.keys())
