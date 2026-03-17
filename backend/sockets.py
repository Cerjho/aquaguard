"""
backend/sockets.py
------------------
Flask-SocketIO event handlers.

CRITICAL (R6-E): The socketio instance is imported from extensions.py —
it is NEVER re-initialised here.

Server-emitted events (called from route handlers, not from this file):
  alert_event    — emitted on confirmed drowning alert (from routes/events.py)
  camera_status  — emitted on camera connect/disconnect (from CV engine or routes)
  system_status  — emitted on detection engine status change

Client-originated events handled here:
  connect    — validate JWT token from handshake, log connection
  disconnect — log session end
"""

import logging

from flask import request
from flask_jwt_extended import decode_token

from extensions import socketio  # R6-E: shared instance, never re-init

logger = logging.getLogger(__name__)


# ── Connection Handlers ───────────────────────────────────────────────────────

@socketio.on('connect')
def handle_connect(auth=None):
    """
    Handle a new WebSocket client connection.

    Attempts to validate a JWT token if provided in:
    - handshake auth dict: auth.get('token')
    - query parameter:     request.args.get('token')

    Invalid or missing tokens are logged as warnings but do NOT forcibly
    reject the connection — the HTTP routes enforce authentication
    independently. This allows dashboard clients to connect and receive
    public broadcast events while authenticated routes remain protected.

    Emitted events from server (documented here for reference):
        alert_event    — payload: Alert.to_dict()
        camera_status  — payload: {zone_id, status, timestamp}
        system_status  — payload: {component, status, message, timestamp}
    """
    sid = request.sid
    token = None

    # Try auth dict first (socket.io-client sends {auth: {token: '...'}})
    if auth and isinstance(auth, dict):
        token = auth.get('token')

    # Fallback to query parameter
    if not token:
        token = request.args.get('token')

    user_info = 'anonymous'
    if token:
        try:
            decoded = decode_token(token)
            user_info = f"user_id={decoded.get('sub')} role={decoded.get('role', 'unknown')}"
        except Exception as exc:
            logger.warning(
                "SocketIO connect: invalid JWT from sid=%s — %s", sid, exc
            )

    logger.info("SocketIO connect: sid=%s %s", sid, user_info)


@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket client disconnection. Logs the session end."""
    sid = request.sid
    logger.info("SocketIO disconnect: sid=%s", sid)
