import os
import base64
import uuid
import tempfile
import io
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import SQLAlchemyError
from PIL import Image, UnidentifiedImageError

from extensions import db, socketio
from models import DetectionEvent, Alert
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
    payload = alert.to_dict()
    payload.update({
        'alert_id': alert.alert_id,
        'zone_id': alert.zone_id,
        'status': alert.status,
        'triggered_at': alert.triggered_at.isoformat() if alert.triggered_at else None,
        # Alias used by some clients
        'timestamp': alert.triggered_at.isoformat() if alert.triggered_at else None,
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
        'timestamp': event.detected_at.isoformat() if event.detected_at else None,
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
        return None, jsonify({'error': 'event_id must be a valid UUID'})


def _parse_int_query(name, default, min_value=1, max_value=None):
    raw = request.args.get(name, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, jsonify({'error': f'{name} must be an integer'})
    if value < min_value:
        return None, jsonify({'error': f'{name} must be >= {min_value}'})
    if max_value is not None and value > max_value:
        return max_value, None
    return value, None


@events_bp.route('/events', methods=['POST'])
def create_event():
    """Internal endpoint called by the detection engine."""
    data = request.get_json(silent=True) or {}

    required = ['zone_id', 'track_id', 'confidence_score', 'behavior_flags',
                'alert_triggered', 'detected_at']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {missing}'}), 400

    event_id, event_id_error = _parse_event_id(data.get('event_id'))
    if event_id_error is not None:
        return event_id_error, 400
    snapshot_path = None

    # Save snapshot if provided
    snapshot_b64 = data.get('snapshot_base64')
    if snapshot_b64:
        try:
            os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
            img_data = base64.b64decode(snapshot_b64, validate=True)
            if len(img_data) > MAX_SNAPSHOT_BYTES:
                return jsonify({'error': 'Snapshot too large'}), 413
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
        except (base64.binascii.Error, ValueError):
            return jsonify({'error': 'Invalid snapshot encoding'}), 400
        except UnidentifiedImageError:
            return jsonify({'error': 'Invalid image data'}), 400
        except OSError as exc:
            current_app.logger.warning(f'Failed to save snapshot: {exc}')
            snapshot_path = None

    detected_at = parse_detected_at(data.get('detected_at'))

    event = DetectionEvent(
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
    db.session.add(event)

    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error saving event: {exc}')
        return jsonify({'error': 'Database error'}), 500
    try:
        socketio.emit('detection_event', _serialize_detection_event_payload(event))
        socketio.emit('camera_status', {'zone_id': event.zone_id, 'status': 'online'})
        socketio.emit('system_status', {
            'component': 'detection_engine',
            'status': 'online',
            'message': f'Event received from {event.zone_id}',
        })
    except Exception as exc:
        current_app.logger.error('SocketIO emit failed for detection event %s: %s', event_id, exc)

    alert_dict = None
    if event.alert_triggered:
        alert = Alert(
            alert_id     = str(uuid.uuid4()),
            event_id     = event_id,
            zone_id      = event.zone_id,
            status       = 'unacknowledged',
            triggered_at = parse_detected_at(None),
        )
        db.session.add(alert)
        try:
            db.session.commit()
        except SQLAlchemyError as exc:
            db.session.rollback()
            current_app.logger.error(f'DB error saving alert: {exc}')
        else:
            # emit AFTER commit so alert_id exists in DB
            alert_dict = _serialize_alert_event_payload(alert, event)
            try:
                socketio.emit('alert_event', alert_dict)
            except Exception as exc:
                current_app.logger.error(
                    'SocketIO emit failed for alert event %s: %s',
                    event_id,
                    exc,
                )

    result = event.to_dict()
    if alert_dict:
        result['alert'] = alert_dict
        # Backward-compatible convenience field for clients expecting top-level alert_id
        result['alert_id'] = alert_dict.get('alert_id')
    return jsonify(result), 201


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
        return page_error, 400
    limit, limit_error = _parse_int_query('limit', 20, min_value=1, max_value=100)
    if limit_error is not None:
        return limit_error, 400

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
        return jsonify({
            'total': 0,
            'page': page,
            'limit': limit,
            'events': [],
        }), 200

    return jsonify({
        'total': pagination.total,
        'page':  page,
        'limit': limit,
        'events': [e.to_dict() for e in pagination.items],
    }), 200
