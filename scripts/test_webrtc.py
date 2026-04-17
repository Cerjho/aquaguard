#!/usr/bin/env python
import requests
import sys

offer_sdp = "v=0\no=- 0 0 IN IP4 0.0.0.0\ns=-\nt=0 0"

# Try login
try:
    resp = requests.post('http://127.0.0.1:5000/api/v1/auth/login',
                        json={'username': 'admin', 'password': 'adminpass'},
                        timeout=5)
    if resp.status_code == 200:
        token = resp.json().get('access_token')
        print(f'Token: {token[:20]}...')

        # Now try WebRTC with token
        headers = {'Authorization': f'Bearer {token}'}
        webrtc_payload = {
            'offer_type': 'offer',
            'offer_sdp': offer_sdp,
            'zone_id': 'zone_dev',
        }
        resp2 = requests.post('http://127.0.0.1:5000/api/v1/webrtc/offer',
                             json=webrtc_payload,
                             headers=headers,
                             timeout=5)
        print(f'WebRTC /offer status: {resp2.status_code}')
        data = resp2.json()
        print(f'Response keys: {list(data.keys())}')
        print(f'Fallback active: {data.get("fallback_active", "N/A")}')
        print(f'Has SDP: {bool(data.get("sdp"))}')
    else:
        print(f'Login failed: {resp.status_code}')
except requests.exceptions.ConnectionError:
    print('ERROR: Backend not running on localhost:5000')
except Exception as e:
    print(f'Error: {type(e).__name__}: {e}')
    sys.exit(1)
