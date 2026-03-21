from datetime import datetime, timedelta, timezone
from threading import Lock
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import verify_jwt_in_request

from extensions import socketio

webrtc_bp = Blueprint('webrtc', __name__, url_prefix='/api/v1/webrtc')

_SESSION_LOCK = Lock()
_SESSIONS = {}


def _utc_now():
    return datetime.now(timezone.utc)


def _session_ttl_seconds():
    raw = current_app.config.get('WEBRTC_SESSION_TTL_SECONDS')
    if raw is None:
        raw = current_app.config.get('SESSION_TTL_SECONDS')
    if raw is None:
        raw = 300
    try:
        value = int(raw)
        return max(value, 30)
    except (TypeError, ValueError):
        return 300


def _cleanup_expired_sessions():
    now = _utc_now()
    expired_ids = [
        session_id for session_id, payload in _SESSIONS.items()
        if payload.get('expires_at') and payload['expires_at'] <= now
    ]
    for session_id in expired_ids:
        _SESSIONS.pop(session_id, None)


def _authorized_actor():
    if request.headers.get('Authorization'):
        try:
            verify_jwt_in_request()
            return {'authorized': True, 'auth_type': 'jwt'}
        except Exception:
            return {'authorized': False}

    expected_key = current_app.config.get('AQUAGUARD_API_KEY')
    provided_key = request.headers.get('X-API-Key')
    if expected_key and provided_key and expected_key == provided_key:
        return {'authorized': True, 'auth_type': 'api_key'}
    return {'authorized': False}


def _ensure_authorized():
    auth = _authorized_actor()
    if not auth['authorized']:
        return None, (jsonify({'error': 'Unauthorized'}), 401)
    return auth, None


def _session_payload(session):
    offer = session.get('offer') or {}
    candidates = session.get('ice_candidates') or []
    fallback = session.get('fallback') or {}
    return {
        'session_id': session['session_id'],
        'zone_id': session.get('zone_id'),
        'client_id': session.get('client_id'),
        'status': session.get('status'),
        'state': session.get('status'),
        'created_at': session.get('created_at').isoformat() if session.get('created_at') else None,
        'updated_at': session.get('updated_at').isoformat() if session.get('updated_at') else None,
        'expires_at': session.get('expires_at').isoformat() if session.get('expires_at') else None,
        'webrtc': {
            'offer_received': bool(offer.get('sdp')),
            'offer_type': offer.get('type'),
            'candidate_count': len(candidates),
        },
        'fallback': {
            'transport': fallback.get('transport', 'mjpeg'),
            'active': fallback.get('active', False),
            'reason': fallback.get('reason'),
        },
    }


def _parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _ice_servers_from_config():
    stun_raw = current_app.config.get('WEBRTC_STUN_URLS', '')
    turn_url = current_app.config.get('WEBRTC_TURN_URL')
    turn_username = current_app.config.get('WEBRTC_TURN_USERNAME')
    turn_credential = current_app.config.get('WEBRTC_TURN_CREDENTIAL')
    force_relay = _parse_bool(current_app.config.get('WEBRTC_FORCE_RELAY'), default=False)
    transport_policy = current_app.config.get('WEBRTC_ICE_TRANSPORT_POLICY', 'all')

    stun_urls = [url.strip() for url in str(stun_raw).split(',') if url.strip()]
    servers = []
    if stun_urls:
        servers.append({'urls': stun_urls if len(stun_urls) > 1 else stun_urls[0]})
    if turn_url and turn_username and turn_credential:
        servers.append({
            'urls': turn_url,
            'username': turn_username,
            'credential': turn_credential,
        })

    if force_relay:
        transport_policy = 'relay'

    return {
        'ice_servers': servers,
        'ice_transport_policy': transport_policy,
        'force_relay': force_relay,
    }


@webrtc_bp.route('/offer', methods=['POST'])
def create_offer():
    auth, error = _ensure_authorized()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    zone_id = data.get('zone_id')
    sdp = data.get('sdp')
    offer_type = data.get('type', 'offer')
    if not zone_id:
        return jsonify({'error': 'zone_id is required'}), 400
    if not sdp:
        return jsonify({'error': 'sdp is required'}), 400
    if offer_type != 'offer':
        return jsonify({'error': 'type must be offer'}), 400

    session_id = str(data.get('session_id') or uuid4())
    now = _utc_now()
    ttl = timedelta(seconds=_session_ttl_seconds())
    with _SESSION_LOCK:
        _cleanup_expired_sessions()
        existing = _SESSIONS.get(session_id)
        revision = (existing.get('revision') if existing else 0) + 1
        session_payload = {
            'session_id': session_id,
            'zone_id': zone_id,
            'client_id': data.get('client_id'),
            'status': 'offer_received',
            'created_at': existing.get('created_at') if existing else now,
            'updated_at': now,
            'expires_at': now + ttl,
            'revision': revision,
            'offer': {
                'type': 'offer',
                'sdp': sdp,
            },
            'ice_candidates': existing.get('ice_candidates', []) if existing else [],
            'fallback': {
                'transport': data.get('fallback_transport', 'mjpeg'),
                'active': False,
                'reason': None,
            },
        }
        _SESSIONS[session_id] = session_payload

    socketio.emit('webrtc_offer_received', {
        'session_id': session_id,
        'zone_id': zone_id,
        'revision': revision,
    })

    return jsonify({
        'session_id': session_id,
        'status': 'offer_received',
        'accepted': True,
        'auth_type': auth['auth_type'],
        'next': {
            'ice_candidate_url': '/api/v1/webrtc/ice-candidate',
            'session_status_url': f'/api/v1/webrtc/session-status/{session_id}',
        },
        'fallback': {
            'transport': session_payload['fallback']['transport'],
            'active': False,
        },
    }), 202


@webrtc_bp.route('/ice-candidate', methods=['POST'])
def add_ice_candidate():
    auth, error = _ensure_authorized()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id')
    candidate = data.get('candidate')
    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400
    if candidate is None:
        return jsonify({'error': 'candidate is required'}), 400

    now = _utc_now()
    ttl = timedelta(seconds=_session_ttl_seconds())
    with _SESSION_LOCK:
        _cleanup_expired_sessions()
        session = _SESSIONS.get(session_id)
        if not session:
            session = {
                'session_id': session_id,
                'zone_id': data.get('zone_id'),
                'client_id': data.get('client_id'),
                'status': 'collecting_candidates',
                'created_at': now,
                'updated_at': now,
                'expires_at': now + ttl,
                'revision': 0,
                'offer': None,
                'ice_candidates': [],
                'fallback': {
                    'transport': data.get('fallback_transport', 'mjpeg'),
                    'active': False,
                    'reason': 'waiting_for_offer',
                },
            }
            _SESSIONS[session_id] = session

        session['ice_candidates'].append({
            'candidate': candidate,
            'sdpMid': data.get('sdpMid'),
            'sdpMLineIndex': data.get('sdpMLineIndex'),
            'received_at': now.isoformat(),
        })
        session['status'] = 'collecting_candidates'
        session['updated_at'] = now
        session['expires_at'] = now + ttl
        candidate_count = len(session['ice_candidates'])

    socketio.emit('webrtc_ice_candidate', {
        'session_id': session_id,
        'candidate_count': candidate_count,
    })

    return jsonify({
        'session_id': session_id,
        'status': 'collecting_candidates',
        'accepted': True,
        'auth_type': auth['auth_type'],
        'candidate_count': candidate_count,
        'next': {
            'session_status_url': f'/api/v1/webrtc/session-status/{session_id}',
        },
    }), 202


@webrtc_bp.route('/session-status', methods=['GET'])
def get_session_status_query():
    auth, error = _ensure_authorized()
    if error:
        return error

    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400
    return _get_session_status(session_id, auth['auth_type'])


@webrtc_bp.route('/session-status/<session_id>', methods=['GET'])
def get_session_status_path(session_id):
    auth, error = _ensure_authorized()
    if error:
        return error
    return _get_session_status(session_id, auth['auth_type'])


def _get_session_status(session_id, auth_type):
    force_fallback = (request.args.get('force_fallback') or '').lower() in {'1', 'true', 'yes'}
    with _SESSION_LOCK:
        _cleanup_expired_sessions()
        session = _SESSIONS.get(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404

        if force_fallback:
            session['status'] = 'fallback_active'
            session['fallback']['active'] = True
            session['fallback']['reason'] = 'forced_by_client'
            session['updated_at'] = _utc_now()

        payload = _session_payload(session)

    payload['auth_type'] = auth_type
    payload['compat'] = {
        'sessionStatus': payload['status'],
        'fallbackMode': payload['fallback']['transport'],
        'retry_after_ms': 1500,
    }
    return jsonify(payload), 200


@webrtc_bp.route('/ice-config', methods=['GET'])
def get_ice_config():
    auth, error = _ensure_authorized()
    if error:
        return error

    config_payload = _ice_servers_from_config()
    return jsonify({
        **config_payload,
        'auth_type': auth['auth_type'],
    }), 200
