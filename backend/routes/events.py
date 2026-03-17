"""
backend/routes/events.py
-------------------------
Detection-event ingestion and retrieval blueprint.

Endpoints
---------
POST /api/v1/events — internal endpoint (from detection engine)
GET  /api/v1/events — paginated list (jwt required)

CRITICAL (R6-D): socketio.emit() is called AFTER db.session.commit()
CRITICAL (R6-E): socketio instance imported from extensions — never re-initialised here
"""

import base64
import logging
import os
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from extensions import db, socketio  # R6-E: shared instance
from models import Alert, DetectionEvent

logger = logging.getLogger(__name__)

events_bp = Blueprint('events', __name__, url_prefix='/api/v1')

# Absolute path to snapshots directory (resolved relative to this file)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SNAPSHOT_DIR = os.path.join(_BACKEND_DIR, 'backend', 'snapshots')
# When running from within backend/, __file__ is already inside backend/
# so we check and adjust:
if not os.path.basename(_BACKEND_DIR) == 'backend':
    _SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snapshots')
else:
    _SNAPSHOT_DIR = os.path.join(_BACKEND_DIR, 'snapshots')

os.makedirs(_SNAPSHOT_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_datetime(value: str):
    """Parse ISO 8601 datetime string to datetime object, or None on failure."""
    if not value:
        return None
    try:
        # Handle both with and without trailing Z
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@events_bp.route('/events', methods=['POST'])
def create_event():
    """
    Ingest a detection event from the CV engine.

    No authentication required — this is an internal LAN endpoint.

    Request body (JSON):
        zone_id          (str, required)
        track_id         (int, required)
        confidence_score (float, required)
        behavior_flags   (dict, required)
        alert_triggered  (bool, required)
        detected_at      (ISO str, required)
        snapshot_base64  (str, optional) — base64-encoded JPEG

    Returns:
        201: {event: DetectionEvent.to_dict(), alert: Alert.to_dict() | None}
        400: missing required fields
        500: database error
    """
    data = request.get_json(silent=True) or {}

    required_fields = [
        'zone_id', 'track_id', 'confidence_score',
        'behavior_flags', 'alert_triggered', 'detected_at',
    ]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {missing}'}), 400

    event_id = str(uuid.uuid4())

    # ── Optional snapshot save ────────────────────────────────────────────────
    snapshot_path = None
    snapshot_b64 = data.get('snapshot_base64')
    if snapshot_b64:
        try:
            image_bytes = base64.b64decode(snapshot_b64)
            snapshot_filename = f'{event_id}.jpg'
            snapshot_path = os.path.join(_SNAPSHOT_DIR, snapshot_filename)
            with open(snapshot_path, 'wb') as fh:
                fh.write(image_bytes)
            # Store relative path for portability
            snapshot_path = os.path.join('snapshots', snapshot_filename)
        except Exception as exc:
            logger.warning("Failed to save snapshot for event %s: %s", event_id, exc)
            snapshot_path = None

    # ── Parse detected_at ─────────────────────────────────────────────────────
    detected_at = _parse_datetime(data['detected_at'])
    if detected_at is None:
        return jsonify({'error': 'Invalid detected_at format (expected ISO 8601)'}), 400

    # ── Create DetectionEvent ─────────────────────────────────────────────────
    event = DetectionEvent(
        event_id=event_id,
        zone_id=data['zone_id'],
        track_id=data.get('track_id'),
        confidence_score=float(data['confidence_score']),
        behavior_flags=data.get('behavior_flags'),
        alert_triggered=bool(data.get('alert_triggered', False)),
        snapshot_path=snapshot_path,
        detected_at=detected_at,
        raw_payload=data,
    )
    db.session.add(event)

    alert = None
    if event.alert_triggered:
        alert = Alert(
            alert_id=str(uuid.uuid4()),
            event_id=event_id,
            zone_id=data['zone_id'],
            status='unacknowledged',
            triggered_at=datetime.utcnow(),
        )
        db.session.add(alert)

    # ── Commit BEFORE emit (R6-D) ─────────────────────────────────────────────
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to commit detection event: %s", exc)
        return jsonify({'error': 'Database error saving event'}), 500

    # ── Emit WebSocket event AFTER commit (R6-D) ──────────────────────────────
    if alert is not None:
        socketio.emit('alert_event', alert.to_dict())  # R6-D: after commit
        logger.info("Emitted alert_event for alert_id=%s", alert.alert_id)

    response_data = {
        'event': event.to_dict(),
        'alert': alert.to_dict() if alert else None,
    }
    return jsonify(response_data), 201


@events_bp.route('/events', methods=['GET'])
@jwt_required()
def list_events():
    """
    Return a paginated list of detection events.

    Query parameters:
        zone_id         (str, optional)  — filter by zone
        from            (ISO str, opt)   — events on or after this datetime
        to              (ISO str, opt)   — events on or before this datetime
        alert_triggered (bool str, opt)  — 'true' or 'false'
        page            (int, default 1)
        limit           (int, default 20, max 100)

    Returns:
        200: {total, page, limit, items: [DetectionEvent.to_dict(), ...]}
    """
    zone_id = request.args.get('zone_id')
    from_dt = _parse_datetime(request.args.get('from'))
    to_dt = _parse_datetime(request.args.get('to'))
    alert_triggered_raw = request.args.get('alert_triggered')

    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(1, int(request.args.get('limit', 20))))
    except (ValueError, TypeError):
        page, limit = 1, 20

    query = DetectionEvent.query

    if zone_id:
        query = query.filter(DetectionEvent.zone_id == zone_id)
    if from_dt:
        query = query.filter(DetectionEvent.detected_at >= from_dt)
    if to_dt:
        query = query.filter(DetectionEvent.detected_at <= to_dt)
    if alert_triggered_raw is not None:
        flag = alert_triggered_raw.lower() == 'true'
        query = query.filter(DetectionEvent.alert_triggered == flag)

    query = query.order_by(DetectionEvent.detected_at.desc())

    total = query.count()
    events = query.offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'total': total,
        'page': page,
        'limit': limit,
        'items': [e.to_dict() for e in events],
    }), 200
