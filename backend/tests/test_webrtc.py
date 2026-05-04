import pytest

import routes.webrtc as webrtc_routes
import services.webrtc_video_service as webrtc_video_service


def _auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def test_webrtc_offer_requires_auth(client):
    resp = client.post('/api/v1/webrtc/offer', json={
        'zone_id': 'zone_01',
        'type': 'offer',
        'sdp': 'v=0\r\no=- 1 2 IN IP4 127.0.0.1',
    })
    assert resp.status_code == 401


def test_webrtc_offer_accepts_jwt_and_returns_contract_shape(client, admin_token):
    resp = client.post('/api/v1/webrtc/offer',
                       headers=_auth_headers(admin_token),
                       json={
                           'zone_id': 'zone_01',
                           'client_id': 'dashboard-1',
                           'type': 'offer',
                           'sdp': 'v=0\r\no=- 1 2 IN IP4 127.0.0.1',
                       })
    assert resp.status_code == 202
    payload = resp.get_json()
    data = payload['data']
    assert data['status'] in {'answer_created', 'fallback_active'}
    assert data['accepted'] is True
    assert data['session_id']
    assert data['next']['ice_candidate_url'] == '/api/v1/webrtc/ice-candidate'
    assert '/api/v1/webrtc/session-status/' in data['next']['session_status_url']
    if data['status'] == 'answer_created':
        assert data['type'] == 'answer'
        assert data['sdp']
    else:
        assert data['fallback']['active'] is True
        assert data['fallback']['reason']


def test_webrtc_ice_config_accepts_cookie_jwt(client):
    login = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass',
    })
    assert login.status_code == 200

    # No Authorization header: request should still be authenticated via JWT cookie.
    resp = client.get('/api/v1/webrtc/ice-config')
    assert resp.status_code == 200
    payload = resp.get_json()
    data = payload['data']
    assert data.get('auth_type') == 'jwt_cookie'


def test_webrtc_ice_candidate_and_session_status_flow(client, admin_token):
    offer = client.post('/api/v1/webrtc/offer',
                        headers=_auth_headers(admin_token),
                        json={
                            'zone_id': 'zone_02',
                            'client_id': 'dashboard-2',
                            'type': 'offer',
                            'sdp': 'v=0\r\no=- 5 6 IN IP4 127.0.0.1',
                        })
    session_id = offer.get_json()['data']['session_id']

    candidate_payload = {
        'session_id': session_id,
        'candidate': 'candidate:0 1 UDP 2122252543 192.168.1.2 54400 typ host',
        'sdpMid': '0',
        'sdpMLineIndex': 0,
    }
    candidate = client.post(
        '/api/v1/webrtc/ice-candidate',
        headers=_auth_headers(admin_token),
        json=candidate_payload,
    )
    assert candidate.status_code == 202
    candidate_payload = candidate.get_json()['data']
    assert candidate_payload['status'] == 'collecting_candidates'
    assert candidate_payload['candidate_count'] >= 1

    status = client.get(f'/api/v1/webrtc/session-status/{session_id}',
                        headers=_auth_headers(admin_token))
    assert status.status_code == 200
    status_payload = status.get_json()['data']
    assert status_payload['session_id'] == session_id
    assert status_payload['webrtc']['offer_received'] is True
    assert 'answer_created' in status_payload['webrtc']
    assert status_payload['webrtc']['candidate_count'] >= 1
    assert 'fallback' in status_payload
    assert status_payload['compat']['sessionStatus'] == status_payload['status']


def test_webrtc_session_status_force_fallback(client, admin_token):
    offer = client.post('/api/v1/webrtc/offer',
                        headers=_auth_headers(admin_token),
                        json={
                            'zone_id': 'zone_03',
                            'type': 'offer',
                            'sdp': 'v=0\r\no=- 9 10 IN IP4 127.0.0.1',
                        })
    session_id = offer.get_json()['data']['session_id']

    status = client.get(
        f'/api/v1/webrtc/session-status/{session_id}?force_fallback=true',
        headers=_auth_headers(admin_token),
    )
    assert status.status_code == 200
    payload = status.get_json()['data']
    assert payload['status'] == 'fallback_active'
    assert payload['fallback']['active'] is True
    assert payload['fallback']['reason'] == 'forced_by_client'


def test_webrtc_ice_config_contract(client, admin_token):
    resp = client.get('/api/v1/webrtc/ice-config', headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    payload = resp.get_json()['data']
    assert 'ice_servers' in payload
    assert 'ice_transport_policy' in payload
    assert 'force_relay' in payload


def test_webrtc_ice_config_uses_udp_turn_only_when_available(
    client, admin_token, monkeypatch
):
    monkeypatch.setitem(
        client.application.config,
        'WEBRTC_TURN_URL',
        'turn:192.168.110.200:3478?transport=udp,turn:192.168.110.200:3478?transport=tcp',
    )
    monkeypatch.setitem(client.application.config, 'WEBRTC_TURN_USERNAME', 'aquaguard')
    monkeypatch.setitem(client.application.config, 'WEBRTC_TURN_CREDENTIAL', 'aquaguardpass')

    resp = client.get('/api/v1/webrtc/ice-config', headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    payload = resp.get_json()['data']

    turn_urls = next(
        (
            server.get('urls')
            for server in payload['ice_servers']
            if str(server.get('urls')).startswith('turn:')
            or (
                isinstance(server.get('urls'), list)
                and any(str(url).startswith('turn:') for url in server['urls'])
            )
        ),
        None,
    )
    assert turn_urls is not None
    normalized_turn_urls = turn_urls if isinstance(turn_urls, list) else [turn_urls]
    assert len(normalized_turn_urls) == 1
    assert 'transport=udp' in str(normalized_turn_urls[0]).lower()


def test_webrtc_ice_config_sanitizes_invalid_transport_policy(
    client, admin_token, monkeypatch
):
    monkeypatch.setitem(client.application.config, 'WEBRTC_ICE_TRANSPORT_POLICY', 'invalid')

    resp = client.get('/api/v1/webrtc/ice-config', headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    payload = resp.get_json()['data']
    assert payload['ice_transport_policy'] == 'all'


def test_webrtc_ice_config_drops_tcp_turn_when_udp_exists(
    client, admin_token, monkeypatch
):
    monkeypatch.setitem(
        client.application.config,
        'WEBRTC_TURN_URL',
        'turn:192.168.110.200:3478?transport=tcp,turn:192.168.110.200:3478?transport=udp',
    )
    monkeypatch.setitem(client.application.config, 'WEBRTC_TURN_USERNAME', 'aquaguard')
    monkeypatch.setitem(client.application.config, 'WEBRTC_TURN_CREDENTIAL', 'aquaguardpass')

    resp = client.get('/api/v1/webrtc/ice-config', headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    payload = resp.get_json()['data']

    turn_urls = next(
        (
            server.get('urls')
            for server in payload['ice_servers']
            if str(server.get('urls')).startswith('turn:')
            or (
                isinstance(server.get('urls'), list)
                and any(str(url).startswith('turn:') for url in server['urls'])
            )
        ),
        None,
    )
    assert turn_urls is not None
    normalized_turn_urls = turn_urls if isinstance(turn_urls, list) else [turn_urls]
    assert len(normalized_turn_urls) == 1
    assert 'transport=udp' in str(normalized_turn_urls[0]).lower()


def test_create_peer_connection_applies_ice_runtime_config(app, monkeypatch):
    captured = {}

    class FakeRTCIceServer:
        def __init__(self, **kwargs):
            self.payload = kwargs

    class FakeRTCConfiguration:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    def fake_peer_connection(config=None):
        captured['config'] = config
        return {'config': config}

    monkeypatch.setattr(webrtc_routes, 'RTCIceServer', FakeRTCIceServer)
    monkeypatch.setattr(webrtc_routes, 'RTCConfiguration', FakeRTCConfiguration)
    monkeypatch.setattr(webrtc_routes, 'RTCPeerConnection', fake_peer_connection)

    with app.app_context():
        app.config['WEBRTC_STUN_URLS'] = 'stun:stun.l.google.com:19302'
        app.config['WEBRTC_TURN_URL'] = 'turn:192.168.110.200:3478?transport=udp'
        app.config['WEBRTC_TURN_USERNAME'] = 'aquaguard'
        app.config['WEBRTC_TURN_CREDENTIAL'] = 'aquaguardpass'
        app.config['WEBRTC_ICE_TRANSPORT_POLICY'] = 'relay'
        pc = webrtc_routes._create_peer_connection()

    assert pc is not None
    config = captured.get('config')
    assert config is not None
    assert config.kwargs['iceTransportPolicy'] == 'relay'
    assert len(config.kwargs['iceServers']) == 2


def test_webrtc_offer_rejects_invalid_session_id(client, admin_token):
    resp = client.post('/api/v1/webrtc/offer',
                       headers=_auth_headers(admin_token),
                       json={
                           'zone_id': 'zone_01',
                           'type': 'offer',
                           'sdp': 'v=0\r\no=- 1 2 IN IP4 127.0.0.1',
                           'session_id': 'not-a-uuid',
                       })
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'session_id must be a valid UUID'


def test_webrtc_ice_candidate_rejects_invalid_session_id(client, admin_token):
    resp = client.post('/api/v1/webrtc/ice-candidate',
                       headers=_auth_headers(admin_token),
                       json={
                           'session_id': 'invalid-id',
                           'candidate': 'candidate:0 1 UDP 2122252543 192.168.1.2 54400 typ host',
                       })
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'session_id must be a valid UUID'


def test_webrtc_session_status_rejects_invalid_session_id(client, admin_token):
    query_resp = client.get('/api/v1/webrtc/session-status?session_id=bad-id',
                            headers=_auth_headers(admin_token))
    assert query_resp.status_code == 400
    assert query_resp.get_json()['error'] == 'session_id must be a valid UUID'

    path_resp = client.get('/api/v1/webrtc/session-status/not-a-uuid',
                           headers=_auth_headers(admin_token))
    assert path_resp.status_code == 400
    assert path_resp.get_json()['error'] == 'session_id must be a valid UUID'


def test_webrtc_empty_ice_candidate_is_ignored(client, admin_token):
    offer = client.post('/api/v1/webrtc/offer',
                        headers=_auth_headers(admin_token),
                        json={
                            'zone_id': 'zone_empty_candidate',
                            'client_id': 'dashboard-empty-candidate',
                            'type': 'offer',
                            'sdp': 'v=0\r\no=- 13 14 IN IP4 127.0.0.1',
                        })
    session_id = offer.get_json()['data']['session_id']

    candidate = client.post(
        '/api/v1/webrtc/ice-candidate',
        headers=_auth_headers(admin_token),
        json={
            'session_id': session_id,
            'candidate': '',
            'sdpMid': '0',
            'sdpMLineIndex': 0,
        },
    )
    assert candidate.status_code == 202
    candidate_payload = candidate.get_json()['data']
    assert candidate_payload['accepted'] is True
    assert candidate_payload['candidate_ignored'] is True
    assert candidate_payload['candidate_count'] == 0

    status = client.get(
        f'/api/v1/webrtc/session-status/{session_id}',
        headers=_auth_headers(admin_token),
    )
    assert status.status_code == 200
    status_payload = status.get_json()['data']
    assert status_payload['webrtc']['candidate_count'] == 0
    assert status_payload.get('fallback', {}).get('reason') != 'ice_candidate_rejected'


def test_webrtc_offer_survives_missing_opencv_decoder(client, admin_token, monkeypatch):
    if not webrtc_routes.AIORTC_AVAILABLE:
        pytest.skip(f'aiortc unavailable in test env: {webrtc_routes.AIORTC_IMPORT_ERROR}')

    monkeypatch.setattr(webrtc_video_service, '_CV2_DECODER_AVAILABLE', False)
    monkeypatch.setattr(webrtc_video_service, 'cv2', None)
    monkeypatch.setattr(webrtc_video_service, 'np', None)

    resp = client.post(
        '/api/v1/webrtc/offer',
        headers=_auth_headers(admin_token),
        json={
            'zone_id': 'zone_cv2less',
            'client_id': 'dashboard-cv2less',
            'type': 'offer',
            'sdp': 'v=0\r\no=- 11 12 IN IP4 127.0.0.1',
        },
    )

    assert resp.status_code == 202
    payload = resp.get_json()['data']
    assert payload['status'] in {'answer_created', 'fallback_active'}
    if payload['status'] == 'fallback_active':
        reason = ((payload.get('fallback') or {}).get('reason') or '').lower()
        assert 'cv2' not in reason
