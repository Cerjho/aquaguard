from datetime import datetime


def _make_alert_event(client):
    """Helper: POST an event with alert_triggered=True."""
    resp = client.post('/api/v1/events', json={
        'zone_id':          'zone_01',
        'track_id':         99,
        'confidence_score': 0.9,
        'behavior_flags':   {'vertical': True},
        'alert_triggered':  True,
        'detected_at':      datetime.utcnow().isoformat(),
    })
    return resp.get_json().get('alert', {}).get('alert_id')


def test_list_alerts_requires_auth(client):
    resp = client.get('/api/v1/alerts')
    assert resp.status_code == 401


def test_list_alerts(client, admin_token):
    resp = client.get('/api/v1/alerts',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_list_alerts_filter_unacknowledged(client, admin_token):
    resp = client.get('/api/v1/alerts?status=unacknowledged',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200


def test_acknowledge_alert(client, admin_token):
    alert_id = _make_alert_event(client)
    assert alert_id, 'No alert was created'

    resp = client.post(
        f'/api/v1/alerts/{alert_id}/acknowledge',
        json={'notes': 'handled'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'acknowledged'
    assert data['notes'] == 'handled'


def test_acknowledge_nonexistent_alert(client, admin_token):
    resp = client.post(
        '/api/v1/alerts/nonexistent-id/acknowledge',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 404
