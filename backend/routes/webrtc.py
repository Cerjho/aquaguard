import asyncio
import logging
import time
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread
from uuid import UUID, uuid4

from flask import Blueprint, current_app, request
from flask_jwt_extended import verify_jwt_in_request
from flask_jwt_extended.exceptions import JWTExtendedException

from extensions import socketio, limiter
from routes.metrics import WEBRTC_SESSIONS_ACTIVE
from utils.response_utils import success_response, error_response

webrtc_bp = Blueprint('webrtc', __name__, url_prefix='/api/v1/webrtc')

_SESSION_LOCK = Lock()
_SESSIONS = {}
_MAX_WEBRTC_SESSIONS = 200
_WEBRTC_LOOP = None
_WEBRTC_LOOP_THREAD = None
_WEBRTC_FUTURE_TIMEOUT_SECONDS = 10

LOGGER = logging.getLogger(__name__)

from services.webrtc_video_service import (
    AIORTC_AVAILABLE,
    AIORTC_IMPORT_ERROR,
    RTCPeerConnection,
    RTCSessionDescription,
    SnapshotVideoTrack,
    candidate_from_sdp,
)


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
    expired_ids = []
    expired_payloads = []
    for session_id, payload in _SESSIONS.items():
        expires_at = payload.get('expires_at')
        if expires_at and expires_at <= now:
            expired_ids.append(session_id)
            expired_payloads.append(payload)

    for session_id in expired_ids:
        _SESSIONS.pop(session_id, None)
    for payload in expired_payloads:
        _close_peer_connection(payload)

    # Enforce maximum session bounds
    if len(_SESSIONS) > _MAX_WEBRTC_SESSIONS:
        # Evict oldest sessions
        sorted_sessions = sorted(
            _SESSIONS.values(),
            key=lambda x: x.get('updated_at', datetime.min.replace(tzinfo=timezone.utc))
        )
        to_remove = sorted_sessions[:len(_SESSIONS) - _MAX_WEBRTC_SESSIONS]
        for s in to_remove:
            sid = s['session_id']
            _SESSIONS.pop(sid, None)
            _close_peer_connection(s)

    WEBRTC_SESSIONS_ACTIVE.set(len(_SESSIONS))


def _authorized_actor():
    try:
        # Accept JWT from configured locations (headers or cookies).
        verify_jwt_in_request()
        auth_type = 'jwt_header' if request.headers.get('Authorization') else 'jwt_cookie'
        return {'authorized': True, 'auth_type': auth_type}
    except JWTExtendedException as exc:
        LOGGER.debug('JWT verification failed: %s; attempting API key auth', exc)

    expected_key = current_app.config.get('AQUAGUARD_API_KEY')
    provided_key = request.headers.get('X-API-Key')
    if expected_key and provided_key and expected_key == provided_key:
        return {'authorized': True, 'auth_type': 'api_key'}
    return {'authorized': False}


def _ensure_authorized():
    auth = _authorized_actor()
    if not auth['authorized']:
        return None, error_response('Unauthorized', status_code=401)
    return auth, None


def _session_payload(session):
    offer = session.get('offer') or {}
    answer = session.get('answer') or {}
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
            'answer_created': bool(answer.get('sdp')),
            'answer_type': answer.get('type'),
            'candidate_count': len(candidates),
        },
        'fallback': {
            'transport': fallback.get('transport', 'mjpeg'),
            'active': fallback.get('active', False),
            'reason': fallback.get('reason'),
        },
    }


from utils.env_utils import is_truthy


def _parse_bool(value, default=False):
    if value is None:
        return default
    return is_truthy(value)


def _normalize_session_id(raw_session_id):
    if raw_session_id is None:
        return None, None
    value = str(raw_session_id).strip()
    if not value:
        return None, 'session_id is required'
    try:
        return str(UUID(value)), None
    except (ValueError, TypeError, AttributeError):
        return None, 'session_id must be a valid UUID'


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


def _start_webrtc_loop():
    global _WEBRTC_LOOP
    loop = asyncio.new_event_loop()
    _WEBRTC_LOOP = loop
    asyncio.set_event_loop(loop)
    loop.run_forever()


def _ensure_webrtc_loop():
    global _WEBRTC_LOOP_THREAD
    if not AIORTC_AVAILABLE:
        raise RuntimeError(f'aiortc unavailable: {AIORTC_IMPORT_ERROR}')
    if _WEBRTC_LOOP and _WEBRTC_LOOP.is_running():
        return _WEBRTC_LOOP
    _WEBRTC_LOOP_THREAD = Thread(target=_start_webrtc_loop, daemon=True, name='webrtc-loop')
    _WEBRTC_LOOP_THREAD.start()
    for _ in range(20):
        if _WEBRTC_LOOP and _WEBRTC_LOOP.is_running():
            return _WEBRTC_LOOP
        time.sleep(0.05)
    raise RuntimeError('WebRTC event loop failed to start')


def _future_timeout_seconds():
    raw = current_app.config.get('WEBRTC_FUTURE_TIMEOUT_SECONDS', _WEBRTC_FUTURE_TIMEOUT_SECONDS)
    try:
        return max(float(raw), 5.0)
    except (TypeError, ValueError):
        return float(_WEBRTC_FUTURE_TIMEOUT_SECONDS)


def _ice_gathering_timeout_seconds():
    raw = current_app.config.get('WEBRTC_ICE_GATHERING_TIMEOUT_SECONDS', 3)
    try:
        return max(float(raw), 0.5)
    except (TypeError, ValueError):
        return 3.0


def _run_in_webrtc_loop(coro):
    loop = _ensure_webrtc_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    try:
        return future.result(timeout=_future_timeout_seconds())
    except FutureTimeoutError as exc:
        raise RuntimeError('WebRTC operation timed out') from exc


async def _create_answer_async(zone_id, offer_type, offer_sdp):
    pc = RTCPeerConnection()
    pc.addTrack(SnapshotVideoTrack(zone_id))
    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type=offer_type))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        ice_timeout = _ice_gathering_timeout_seconds()
        if pc.iceGatheringState != 'complete':
            try:
                await asyncio.wait_for(
                    _wait_for_ice_gathering_complete(pc),
                    timeout=ice_timeout,
                )
            except asyncio.TimeoutError:
                LOGGER.warning(
                    (
                        'WebRTC ICE gathering timeout for zone %s after %.2fs; '
                        'continuing with partial candidates'
                    ),
                    zone_id,
                    ice_timeout,
                )
        return {
            'pc': pc,
            'sdp': pc.localDescription.sdp,
            'type': pc.localDescription.type,
        }
    except Exception as exc:
        await pc.close()
        raise RuntimeError(f'Answer creation failed: {type(exc).__name__}: {exc}') from exc


async def _close_peer_connection_async(pc):
    await pc.close()


async def _wait_for_ice_gathering_complete(pc):
    if pc.iceGatheringState == 'complete':
        return
    done = asyncio.Event()

    @pc.on('icegatheringstatechange')
    async def _on_ice_gathering_state_change():
        if pc.iceGatheringState == 'complete':
            done.set()

    await done.wait()


def _normalize_candidate_sdp(candidate):
    value = str(candidate or '').strip()
    if not value:
        raise ValueError('candidate is empty')
    if value.startswith('candidate:'):
        return value[len('candidate:'):]
    return value


def _is_empty_candidate(candidate):
    value = str(candidate or '').strip()
    if not value:
        return True
    if value.startswith('candidate:'):
        return len(value[len('candidate:'):].strip()) == 0
    return False


async def _add_ice_candidate_async(pc, candidate, sdp_mid, sdp_mline_index):
    if _is_empty_candidate(candidate):
        return False
    parsed = candidate_from_sdp(_normalize_candidate_sdp(candidate))
    parsed.sdpMid = sdp_mid
    parsed.sdpMLineIndex = int(sdp_mline_index) if sdp_mline_index is not None else None
    await pc.addIceCandidate(parsed)
    return True


def _close_peer_connection(session):
    pc = session.get('peer_connection')
    if not pc:
        return
    session['peer_connection'] = None
    if not AIORTC_AVAILABLE:
        return
    try:
        loop = _ensure_webrtc_loop()
        asyncio.run_coroutine_threadsafe(_close_peer_connection_async(pc), loop)
    except Exception as exc:
        LOGGER.warning('WebRTC peer connection close failed: %s', exc)


@webrtc_bp.route('/offer', methods=['POST'])
@limiter.limit('20 per minute')
def create_offer():
    auth, error = _ensure_authorized()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    zone_id = data.get('zone_id')
    sdp = data.get('sdp')
    offer_type = data.get('type', 'offer')
    if not zone_id:
        return error_response('zone_id is required', status_code=400)
    if not sdp:
        return error_response('sdp is required', status_code=400)
    if offer_type != 'offer':
        return error_response('type must be offer', status_code=400)

    provided_session_id = data.get('session_id')
    if provided_session_id is None:
        session_id = str(uuid4())
    else:
        session_id, session_id_error = _normalize_session_id(provided_session_id)
        if session_id_error:
            return error_response(session_id_error, status_code=400)
    now = _utc_now()
    ttl = timedelta(seconds=_session_ttl_seconds())
    with _SESSION_LOCK:
        _cleanup_expired_sessions()
        existing = _SESSIONS.get(session_id)
        if existing:
            _close_peer_connection(existing)
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
            'answer': None,
            'ice_candidates': existing.get('ice_candidates', []) if existing else [],
            'peer_connection': None,
            'fallback': {
                'transport': data.get('fallback_transport', 'mjpeg'),
                'active': False,
                'reason': None,
            },
        }

    answer_payload = None
    if AIORTC_AVAILABLE:
        try:
            answer_payload = _run_in_webrtc_loop(_create_answer_async(zone_id, offer_type, sdp))
        except Exception as exc:
            LOGGER.warning('WebRTC answer creation failed for zone %s: %s', zone_id, exc)
            session_payload['status'] = 'fallback_active'
            session_payload['fallback']['active'] = True
            session_payload['fallback']['reason'] = f'webrtc_answer_failed: {exc}'
    else:
        session_payload['status'] = 'fallback_active'
        session_payload['fallback']['active'] = True
        session_payload['fallback']['reason'] = f'aiortc_unavailable: {AIORTC_IMPORT_ERROR}'

    if answer_payload:
        session_payload['status'] = 'answer_created'
        session_payload['answer'] = {
            'type': answer_payload['type'],
            'sdp': answer_payload['sdp'],
        }
        session_payload['peer_connection'] = answer_payload['pc']

    with _SESSION_LOCK:
        _SESSIONS[session_id] = session_payload
        WEBRTC_SESSIONS_ACTIVE.set(len(_SESSIONS))

    socketio.emit('webrtc_offer_received', {
        'session_id': session_id,
        'zone_id': zone_id,
        'revision': revision,
    })

    return success_response({
        'session_id': session_id,
        'status': session_payload['status'],
        'accepted': True,
        'auth_type': auth['auth_type'],
        'type': (session_payload.get('answer') or {}).get('type'),
        'sdp': (session_payload.get('answer') or {}).get('sdp'),
        'next': {
            'ice_candidate_url': '/api/v1/webrtc/ice-candidate',
            'session_status_url': f'/api/v1/webrtc/session-status/{session_id}',
        },
        'fallback': {
            'transport': session_payload['fallback']['transport'],
            'active': session_payload['fallback']['active'],
            'reason': session_payload['fallback']['reason'],
        },
    }, status_code=202)


@webrtc_bp.route('/ice-candidate', methods=['POST'])
@limiter.limit('60 per minute')
def add_ice_candidate():
    auth, error = _ensure_authorized()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    session_id, session_id_error = _normalize_session_id(data.get('session_id'))
    candidate = data.get('candidate')
    if session_id_error:
        return error_response(session_id_error, status_code=400)
    if candidate is None:
        return error_response('candidate is required', status_code=400)
    skip_candidate = _is_empty_candidate(candidate)

    now = _utc_now()
    ttl = timedelta(seconds=_session_ttl_seconds())
    peer_connection = None
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
                'answer': None,
                'ice_candidates': [],
                'peer_connection': None,
                'fallback': {
                    'transport': data.get('fallback_transport', 'mjpeg'),
                    'active': False,
                    'reason': 'waiting_for_offer',
                },
            }
            _SESSIONS[session_id] = session
            WEBRTC_SESSIONS_ACTIVE.set(len(_SESSIONS))

        if not skip_candidate:
            session['ice_candidates'].append({
                'candidate': candidate,
                'sdpMid': data.get('sdpMid'),
                'sdpMLineIndex': data.get('sdpMLineIndex'),
                'received_at': now.isoformat(),
            })
        session['status'] = 'collecting_candidates'
        session['updated_at'] = now
        session['expires_at'] = now + ttl
        peer_connection = session.get('peer_connection')
        candidate_count = len(session['ice_candidates'])

    if (not skip_candidate) and peer_connection and AIORTC_AVAILABLE:
        try:
            _run_in_webrtc_loop(
                _add_ice_candidate_async(
                    peer_connection,
                    candidate,
                    data.get('sdpMid'),
                    data.get('sdpMLineIndex'),
                )
            )
        except Exception as exc:
            LOGGER.warning(
                'WebRTC ICE candidate rejected for session %s: %s: %r',
                session_id,
                type(exc).__name__,
                exc,
            )
            with _SESSION_LOCK:
                existing = _SESSIONS.get(session_id)
                if existing:
                    existing['status'] = 'fallback_active'
                    existing['fallback']['active'] = True
                    existing['fallback']['reason'] = 'ice_candidate_rejected'
                    existing['updated_at'] = _utc_now()

    socketio.emit('webrtc_ice_candidate', {
        'session_id': session_id,
        'candidate_count': candidate_count,
    })

    return success_response({
        'session_id': session_id,
        'status': 'collecting_candidates',
        'accepted': True,
        'auth_type': auth['auth_type'],
        'candidate_count': candidate_count,
        'candidate_ignored': skip_candidate,
        'next': {
            'session_status_url': f'/api/v1/webrtc/session-status/{session_id}',
        },
    }, status_code=202)


@webrtc_bp.route('/session-status', methods=['GET'])
def get_session_status_query():
    auth, error = _ensure_authorized()
    if error:
        return error

    session_id, session_id_error = _normalize_session_id(request.args.get('session_id'))
    if session_id_error:
        return error_response(session_id_error, status_code=400)
    return _get_session_status(session_id, auth['auth_type'])


@webrtc_bp.route('/session-status/<session_id>', methods=['GET'])
def get_session_status_path(session_id):
    auth, error = _ensure_authorized()
    if error:
        return error
    session_id, session_id_error = _normalize_session_id(session_id)
    if session_id_error:
        return error_response(session_id_error, status_code=400)
    return _get_session_status(session_id, auth['auth_type'])


def _get_session_status(session_id, auth_type):
    force_fallback = (request.args.get('force_fallback') or '').lower() in {'1', 'true', 'yes'}
    with _SESSION_LOCK:
        _cleanup_expired_sessions()
        session = _SESSIONS.get(session_id)
        if not session:
            return error_response('Session not found', status_code=404)

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
    return success_response(payload)


@webrtc_bp.route('/ice-config', methods=['GET'])
def get_ice_config():
    auth, error = _ensure_authorized()
    if error:
        return error

    config_payload = _ice_servers_from_config()
    return success_response({
        **config_payload,
        'auth_type': auth['auth_type'],
    })
