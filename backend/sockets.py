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
    auth_token = (auth or {}).get('token')
    cookie_token = (
        request.cookies.get('access_token_cookie')
        or request.cookies.get('csrf_access_token')
        or None
    )

    decoded = None
    if auth_token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(auth_token)
        except JWTExtendedException as exc:
            logger.warning(f'WebSocket auth token invalid, trying cookie token: {exc}')

    if decoded is None and cookie_token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(cookie_token)
        except JWTExtendedException as exc:
            logger.warning(f'WebSocket cookie token invalid: {exc}')

    if auth_token and decoded is None:
        return False  # reject explicitly invalid token handshakes

    if decoded is not None:
        user_id = decoded.get('sub')
        logger.info(f'WebSocket connect: user_id={user_id}')
    else:
        logger.info('WebSocket connect: anonymous client')

    status = get_runtime_status()
    socketio.emit('system_status', status.get('detection_engine', {}), to=request.sid)
    socketio.emit('camera_status', status.get('camera_status', []), to=request.sid)


@socketio.on('disconnect')
def handle_disconnect():
    logger.info('WebSocket disconnect: client session ended')


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
