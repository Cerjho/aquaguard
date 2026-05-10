import os
import base64
import uuid
import tempfile
import io
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from utils.response_utils import success_response, error_response
from utils.date_utils import serialize_datetime
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import SQLAlchemyError
from PIL import Image, UnidentifiedImageError

from extensions import db, socketio
from models import DetectionEvent
from services.events_service import apply_event_filters, parse_detected_at

events_bp = Blueprint('events', __name__, url_prefix='/api/v1')

SNAPSHOTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'snapshots'
)
MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024


def _serialize_alert_event_payload(alert, event):
    """
    Standard payload contract for `alert_event` websocket emits.

    Keeps legacy fields from Alert.to_dict() while adding explicit frontend
    fields: alert_id, zone_id, status, triggered_at/timestamp,
    confidence_score, snapshot_path and snapshot_url.
    """
    payload = event.to_dict()
    payload.update({
        'alert_id': event.event_id,
        'zone_id': event.zone_id,
        'status': getattr(event, 'status', 'unacknowledged'),
        'triggered_at': serialize_datetime(event.detected_at),
        # Alias used by some clients
        'timestamp': serialize_datetime(event.detected_at),
        'confidence_score': event.confidence_score,
        'bbox': event.bbox,
        'snapshot_path': event.snapshot_path,
        'snapshot_url': None,
    })

    if event.snapshot_path:
        snapshot_name = os.path.basename(event.snapshot_path)
        payload['snapshot_url'] = f'/snapshots/{snapshot_name}'

    return payload


def _serialize_detection_event_payload(event):
    """Normalized payload contract for `detection_event` websocket emits."""
    payload = event.to_dict()
    payload.update({
        'event_type': 'detection_event',
        'timestamp': serialize_datetime(event.detected_at),
        'ingested_at': datetime.now(timezone.utc).isoformat(),
        'snapshot_url': None,
    })

    if event.snapshot_path:
        snapshot_name = os.path.basename(event.snapshot_path)
        payload['snapshot_url'] = f'/snapshots/{snapshot_name}'

    return payload


def _parse_event_id(raw_value):
    if raw_value is None:
        return str(uuid.uuid4()), None
    try:
        return str(uuid.UUID(str(raw_value))), None
    except (TypeError, ValueError, AttributeError):
        return None, error_response('event_id must be a valid UUID', status_code=400)


def _parse_int_query(name, default, min_value=1, max_value=None):
    raw = request.args.get(name, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, error_response(f'{name} must be an integer', status_code=400)
    if value < min_value:
        return None, error_response(f'{name} must be >= {min_value}', status_code=400)
    if max_value is not None and value > max_value:
        return max_value, None
    return value, None


def _validate_event_payload(data):
    """Return an error response if required fields are missing, else None."""
    required = [
        'zone_id', 'track_id', 'confidence_score', 'behavior_flags',
        'alert_triggered', 'detected_at',
    ]
    missing = [f for f in required if f not in data]
    if missing:
        return error_response(f'Missing fields: {missing}', status_code=400)
    return None


def _save_snapshot(snapshot_b64, event_id):
    """Decode, validate, and atomically write a base64-encoded JPEG snapshot.

    Returns:
        (snapshot_path, None) on success
        (None, None) when no snapshot provided or OS write fails
        (None, error_response) on validation failure
    """
    if not snapshot_b64:
        return None, None
    try:
        os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
        img_data = base64.b64decode(snapshot_b64, validate=True)
        if len(img_data) > MAX_SNAPSHOT_BYTES:
            return None, error_response('Snapshot too large', status_code=413)
        image_obj = Image.open(io.BytesIO(img_data))
        image_obj.verify()
        snapshot_path = os.path.join(SNAPSHOTS_DIR, f'{event_id}.jpg')
        with tempfile.NamedTemporaryFile(
            mode='wb',
            dir=SNAPSHOTS_DIR,
            prefix=f'{event_id}_',
            suffix='.tmp',
            delete=False,
        ) as temp_file:
            temp_file.write(img_data)
            temp_path = temp_file.name
        os.replace(temp_path, snapshot_path)
        return snapshot_path, None
    except (base64.binascii.Error, ValueError):
        return None, error_response('Invalid snapshot encoding', status_code=400)
    except UnidentifiedImageError:
        return None, error_response('Invalid image data', status_code=400)
    except OSError as exc:
        current_app.logger.warning('Failed to save snapshot: %s', exc)
        return None, None


def _build_detection_event(data, event_id, snapshot_path, detected_at):
    """Construct a DetectionEvent ORM object from validated payload fields."""
    return DetectionEvent(
        event_id         = event_id,
        zone_id          = data['zone_id'],
        track_id         = data.get('track_id'),
        class_label      = data.get('class_label'),
        yolo_confidence  = data.get('yolo_confidence'),
        pose_confidence  = data.get('pose_confidence'),
        final_confidence = data.get('final_confidence'),
        confidence_score = data.get('confidence_score'),
        behavior_flags   = data.get('behavior_flags'),
        bbox             = data.get('bbox'),
        alert_triggered  = bool(data.get('alert_triggered', False)),
        snapshot_path    = snapshot_path,
        detected_at      = detected_at,
        raw_payload      = data,
    )


def _persist_event(event):
    """Add and commit a DetectionEvent. Roll back and return error on failure."""
    db.session.add(event)
    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error('DB error saving event: %s', exc)
        return error_response('Database error', status_code=500)
    return None


def _emit_detection_signals(event, event_id):
    """Emit SocketIO signals indicating a new detection event was ingested."""
    try:
        socketio.emit('detection_event', _serialize_detection_event_payload(event))
        socketio.emit('camera_status', {'zone_id': event.zone_id, 'status': 'online'})
        socketio.emit('system_status', {
            'component': 'detection_engine',
            'status': 'online',
            'message': f'Event received from {event.zone_id}',
        })
    except (RuntimeError, ValueError, OSError) as exc:
        current_app.logger.error(
            'SocketIO emit failed for detection event %s: %s', event_id, exc
        )


def _create_and_emit_alert(event, event_id):
    """Emit an alert_event if the detection event triggered an alert.

    Returns the serialized alert dict on success, or None if no alert
    was triggered.
    """
    if not event.alert_triggered:
        return None

    # Emit using the event directly
    alert_dict = _serialize_alert_event_payload(None, event)
    try:
        socketio.emit('alert_event', alert_dict)
    except (RuntimeError, ValueError, OSError) as exc:
        current_app.logger.error(
            'SocketIO emit failed for alert event %s: %s', event_id, exc
        )
    return alert_dict


@events_bp.route('/events', methods=['POST'])
def create_event():
    """Internal endpoint called by the detection engine."""
    data = request.get_json(silent=True) or {}

    if (validation_error := _validate_event_payload(data)) is not None:
        return validation_error

    event_id, event_id_error = _parse_event_id(data.get('event_id'))
    if event_id_error is not None:
        return event_id_error

    snapshot_path, snapshot_error = _save_snapshot(data.get('snapshot_base64'), event_id)
    if snapshot_error is not None:
        return snapshot_error

    detected_at = parse_detected_at(data.get('detected_at'))
    event = _build_detection_event(data, event_id, snapshot_path, detected_at)

    if (db_error := _persist_event(event)) is not None:
        return db_error

    _emit_detection_signals(event, event_id)
    alert_dict = _create_and_emit_alert(event, event_id)

    result = event.to_dict()
    if alert_dict:
        result['alert'] = alert_dict
        result['alert_id'] = alert_dict.get('alert_id')
    return success_response(result, status_code=201)


@events_bp.route('/events', methods=['GET'])
@jwt_required()
def list_events():
    zone_id         = request.args.get('zone_id')
    from_dt         = request.args.get('from')
    to_dt           = request.args.get('to')
    alert_triggered = request.args.get('alert_triggered')
    status          = request.args.get('status')
    min_confidence  = request.args.get('min_confidence')
    max_confidence  = request.args.get('max_confidence')
    page, page_error = _parse_int_query('page', 1, min_value=1)
    if page_error is not None:
        return page_error
    limit, limit_error = _parse_int_query('limit', 20, min_value=1, max_value=100)
    if limit_error is not None:
        return limit_error

    query = apply_event_filters(
        DetectionEvent.query,
        zone_id=zone_id,
        from_dt=from_dt,
        to_dt=to_dt,
        alert_triggered=alert_triggered,
        status=status,
    )
    if min_confidence is not None:
        try:
            query = query.filter(DetectionEvent.confidence_score >= float(min_confidence))
        except (TypeError, ValueError):
            pass
    if max_confidence is not None:
        try:
            query = query.filter(DetectionEvent.confidence_score <= float(max_confidence))
        except (TypeError, ValueError):
            pass
    try:
        query = query.order_by(DetectionEvent.detected_at.desc())
        pagination = query.paginate(page=page, per_page=limit, error_out=False)
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error('Failed to fetch events: %s', exc)
        return success_response({
            'total': 0,
            'page': page,
            'limit': limit,
            'events': [],
        })

    return success_response({
        'total': pagination.total,
        'page':  page,
        'limit': limit,
        'events': [e.to_dict() for e in pagination.items],
    })
