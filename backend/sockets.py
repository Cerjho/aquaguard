import logging
from extensions import socketio
from runtime_status import get_runtime_status
from flask import request
from flask_jwt_extended.exceptions import JWTExtendedException

logger = logging.getLogger(__name__)


@socketio.on('connect')
def handle_connect(auth):
    """
    Validate optional JWT on WebSocket handshake.
    auth dict may contain {'token': '<access_token>'}.
    """
    logger.info('WebSocket connect attempt from %s', request.remote_addr)

    auth_token = (auth or {}).get('token')
    cookie_token = (
        request.cookies.get('access_token_cookie')
        or request.cookies.get('csrf_access_token')
        or None
    )

    logger.debug('Auth token present: %s, Cookie token present: %s',
                 bool(auth_token), bool(cookie_token))

    decoded = None
    if auth_token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(auth_token)
        except JWTExtendedException as exc:
            logger.warning('WebSocket auth token invalid, trying cookie token: %s', exc)

    if decoded is None and cookie_token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(cookie_token)
        except JWTExtendedException as exc:
            logger.warning('WebSocket cookie token invalid: %s', exc)

    if auth_token and decoded is None:
        logger.warning('WebSocket connect REJECTED - invalid auth token')
        return False  # reject explicitly invalid token handshakes

    if decoded is not None:
        user_id = decoded.get('sub')
        logger.info('WebSocket connect SUCCESS: user_id=%s, sid=%s', user_id, request.sid)
    else:
        logger.info('WebSocket connect SUCCESS: anonymous client, sid=%s', request.sid)

    status = get_runtime_status()
    socketio.emit('system_status', status.get('detection_engine', {}), to=request.sid)
    socketio.emit('camera_status', status.get('camera_status', []), to=request.sid)


@socketio.on('disconnect')
def handle_disconnect(reason=None):
    sid = getattr(request, 'sid', 'unknown')
    if reason:
        logger.info('WebSocket disconnect: sid=%s reason=%s', sid, reason)
        return
    logger.info('WebSocket disconnect: sid=%s', sid)


@socketio.on_error_default
def default_error_handler(e):
    """Handle socket errors without crashing the connection."""
    logger.error('Socket.IO error: %s', e)


@socketio.on('ping')
def handle_ping():
    """Custom ping handler for debugging connection issues."""
    logger.debug('Received ping from sid=%s', request.sid)
    return 'pong'


# ── Server-emitted events (called from route handlers) ───────────────────────
#
#   alert_event    — emitted in routes/events.py when alert_triggered=True
#                    payload: Alert.to_dict()
#
#   camera_status  — emitted when a camera connects or disconnects
#                    payload: {'zone_id': str, 'status': 'online'|'offline'}
#
#   system_status  — emitted on detection engine status change
#                    payload: {'component': str, 'status': str, 'message': str}
