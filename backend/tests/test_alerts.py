from datetime import datetime, timezone


def _make_alert_event(client):
    """Helper: POST an event with alert_triggered=True."""
    resp = client.post('/api/v1/events', json={
        'zone_id':          'zone_01',
        'track_id':         99,
        'confidence_score': 0.9,
        'behavior_flags':   {'vertical': True},
        'alert_triggered':  True,
        'detected_at':      datetime.now(timezone.utc).isoformat(),
    })
    payload = resp.get_json()['data']
    return (payload.get('alert') or {}).get('alert_id')


def test_list_alerts_requires_auth(client):
    resp = client.get('/api/v1/alerts')
    assert resp.status_code == 401


def test_list_alerts(client, admin_token):
    resp = client.get('/api/v1/alerts',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert isinstance(resp.get_json()['data'], list)


def test_list_alerts_filter_unacknowledged(client, admin_token):
    resp = client.get('/api/v1/alerts?status=unacknowledged',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200


def test_list_alerts_pagination_contract(client, admin_token):
    _make_alert_event(client)
    _make_alert_event(client)

    resp = client.get(
        '/api/v1/alerts?page=1&limit=1',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200
    data = resp.get_json()['data']
    assert isinstance(data, dict)
    assert isinstance(data.get('alerts'), list)
    assert data.get('page') == 1
    assert data.get('limit') == 1
    assert data.get('total', 0) >= 2
    assert len(data['alerts']) <= 1


def test_list_alerts_filters_by_zone_time_and_confidence(client, admin_token):
    first = client.post('/api/v1/events', json={
        'zone_id': 'zone_filter_a',
        'track_id': 1,
        'confidence_score': 0.91,
        'behavior_flags': {'vertical': True},
        'alert_triggered': True,
        'detected_at': '2025-01-10T10:00:00',
    })
    assert first.status_code == 201

    second = client.post('/api/v1/events', json={
        'zone_id': 'zone_filter_b',
        'track_id': 2,
        'confidence_score': 0.35,
        'behavior_flags': {'vertical': False},
        'alert_triggered': True,
        'detected_at': '2025-01-11T10:00:00',
    })
    assert second.status_code == 201

    resp = client.get(
        '/api/v1/alerts?zone_id=zone_filter_a&min_confidence=0.8'
        '&from=2000-01-01T00:00:00&to=2100-01-01T00:00:00',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200
    items = resp.get_json()['data']
    assert len(items) >= 1
    assert all(item['zone_id'] == 'zone_filter_a' for item in items)




