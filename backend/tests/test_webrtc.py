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
    assert payload['status'] == 'offer_received'
    assert payload['accepted'] is True
    assert payload['session_id']
    assert payload['next']['ice_candidate_url'] == '/api/v1/webrtc/ice-candidate'
    assert '/api/v1/webrtc/session-status/' in payload['next']['session_status_url']


def test_webrtc_ice_candidate_and_session_status_flow(client, admin_token):
    offer = client.post('/api/v1/webrtc/offer',
                        headers=_auth_headers(admin_token),
                        json={
                            'zone_id': 'zone_02',
                            'client_id': 'dashboard-2',
                            'type': 'offer',
                            'sdp': 'v=0\r\no=- 5 6 IN IP4 127.0.0.1',
                        })
    session_id = offer.get_json()['session_id']

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
    candidate_payload = candidate.get_json()
    assert candidate_payload['status'] == 'collecting_candidates'
    assert candidate_payload['candidate_count'] >= 1

    status = client.get(f'/api/v1/webrtc/session-status/{session_id}',
                        headers=_auth_headers(admin_token))
    assert status.status_code == 200
    status_payload = status.get_json()
    assert status_payload['session_id'] == session_id
    assert status_payload['webrtc']['offer_received'] is True
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
    session_id = offer.get_json()['session_id']

    status = client.get(
        f'/api/v1/webrtc/session-status/{session_id}?force_fallback=true',
        headers=_auth_headers(admin_token),
    )
    assert status.status_code == 200
    payload = status.get_json()
    assert payload['status'] == 'fallback_active'
    assert payload['fallback']['active'] is True
    assert payload['fallback']['reason'] == 'forced_by_client'


def test_webrtc_ice_config_contract(client, admin_token):
    resp = client.get('/api/v1/webrtc/ice-config', headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    payload = resp.get_json()
    assert 'ice_servers' in payload
    assert 'ice_transport_policy' in payload
    assert 'force_relay' in payload
