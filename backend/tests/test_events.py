from datetime import datetime


def _event_payload(**kwargs):
    base = {
        'zone_id':          'zone_01',
        'track_id':         1,
        'confidence_score': 0.85,
        'behavior_flags':   {'vertical': True},
        'alert_triggered':  False,
        'detected_at':      datetime.utcnow().isoformat(),
    }
    base.update(kwargs)
    return base


def test_create_event(client):
    resp = client.post('/api/v1/events', json=_event_payload())
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['zone_id'] == 'zone_01'
    assert 'event_id' in data


def test_create_event_missing_field(client):
    payload = _event_payload()
    del payload['zone_id']
    resp = client.post('/api/v1/events', json=payload)
    assert resp.status_code == 400


def test_create_event_with_alert(client):
    resp = client.post('/api/v1/events', json=_event_payload(alert_triggered=True))
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['alert_triggered'] is True
    assert 'alert' in data


def test_list_events_requires_auth(client):
    resp = client.get('/api/v1/events')
    assert resp.status_code == 401


def test_list_events(client, admin_token):
    resp = client.get('/api/v1/events',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'events' in data
    assert 'total' in data


def test_list_events_filter_zone(client, admin_token):
    resp = client.get('/api/v1/events?zone_id=zone_01',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
