from datetime import datetime
from models import Alert
import routes.events as events_routes


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


def test_create_event_preserves_client_event_id(client):
    event_id = '4d7c32d8-0ac7-4bcf-a7b2-8ae95876c5d5'
    resp = client.post('/api/v1/events', json=_event_payload(event_id=event_id))
    assert resp.status_code == 201
    assert resp.get_json()['event_id'] == event_id


def test_create_event_rejects_invalid_event_id(client):
    resp = client.post('/api/v1/events', json=_event_payload(event_id='not-a-uuid'))
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'event_id must be a valid UUID'


def test_create_event_persists_detection_metadata_fields(client):
    payload = _event_payload(
        class_label='drowning',
        yolo_confidence=0.91,
        pose_confidence=0.73,
        final_confidence=0.88,
    )
    resp = client.post('/api/v1/events', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['class_label'] == 'drowning'
    assert data['yolo_confidence'] == 0.91
    assert data['pose_confidence'] == 0.73
    assert data['final_confidence'] == 0.88


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
    assert data['alert'].get('alert_id')
    assert data.get('alert_id') == data['alert']['alert_id']


def test_alert_event_emit_payload_contract(client, db, monkeypatch):
    captured = {}

    def fake_emit(event_name, payload):
        if event_name == 'alert_event':
            captured['event_name'] = event_name
            captured['payload'] = payload

    monkeypatch.setattr(events_routes.socketio, 'emit', fake_emit)

    resp = client.post('/api/v1/events', json=_event_payload(
        alert_triggered=True,
        confidence_score=0.93,
    ))
    assert resp.status_code == 201

    assert captured.get('event_name') == 'alert_event'
    payload = captured.get('payload') or {}

    # Contract fields expected by frontend
    assert payload.get('alert_id')
    assert payload.get('zone_id') == 'zone_01'
    assert payload.get('status') == 'unacknowledged'
    assert payload.get('triggered_at')
    assert payload.get('timestamp') == payload.get('triggered_at')
    assert payload.get('confidence_score') == 0.93

    # Optional snapshot fields should exist in shape, even if no snapshot uploaded
    assert 'snapshot_path' in payload
    assert 'snapshot_url' in payload

    # Ensure emitted alert_id maps to a persisted DB alert record
    persisted = Alert.query.filter_by(alert_id=payload['alert_id']).first()
    assert persisted is not None


def test_detection_event_emit_payload_contract(client, monkeypatch):
    captured = {}

    def fake_emit(event_name, payload):
        if event_name == 'detection_event':
            captured['event_name'] = event_name
            captured['payload'] = payload

    monkeypatch.setattr(events_routes.socketio, 'emit', fake_emit)

    resp = client.post('/api/v1/events', json=_event_payload(
        confidence_score=0.77,
    ))
    assert resp.status_code == 201

    assert captured.get('event_name') == 'detection_event'
    payload = captured.get('payload') or {}
    assert payload.get('event_type') == 'detection_event'
    assert payload.get('event_id')
    assert payload.get('zone_id') == 'zone_01'
    assert payload.get('confidence_score') == 0.77
    assert payload.get('timestamp')
    assert payload.get('ingested_at')
    assert 'snapshot_url' in payload


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


def test_list_events_filters_status_and_confidence(client, admin_token):
    client.post('/api/v1/events', json=_event_payload(
        zone_id='zone_01',
        confidence_score=0.95,
        alert_triggered=True,
    ))
    client.post('/api/v1/events', json=_event_payload(
        zone_id='zone_02',
        confidence_score=0.40,
        alert_triggered=False,
    ))

    alerted = client.get(
        '/api/v1/events?status=alerted',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert alerted.status_code == 200
    alerted_events = alerted.get_json()['events']
    assert all(event['alert_triggered'] is True for event in alerted_events)

    confident = client.get(
        '/api/v1/events?min_confidence=0.9',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert confident.status_code == 200
    confident_events = confident.get_json()['events']
    assert all((event.get('confidence_score') or 0) >= 0.9 for event in confident_events)


def test_snapshot_write_uses_atomic_replace(client, monkeypatch):
    replaced = {}

    def fake_replace(src, dst):
        replaced['src'] = src
        replaced['dst'] = dst

    monkeypatch.setattr(events_routes.os, 'replace', fake_replace)

    resp = client.post('/api/v1/events', json=_event_payload(
        snapshot_base64='aGVsbG8=',
    ))
    assert resp.status_code == 201
    assert replaced.get('src')
    assert replaced.get('dst')
    assert replaced['dst'].endswith('.jpg')
