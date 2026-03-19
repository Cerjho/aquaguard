import os
import base64
import uuid
import tempfile
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

from extensions import db, socketio
from models import DetectionEvent, Alert

events_bp = Blueprint('events', __name__, url_prefix='/api/v1')

SNAPSHOTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'snapshots'
)


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
        'snapshot_path': event.snapshot_path,
        'snapshot_url': None,
    })

    if event.snapshot_path:
        snapshot_name = os.path.basename(event.snapshot_path)
        payload['snapshot_url'] = f'/snapshots/{snapshot_name}'

    return payload


@events_bp.route('/events', methods=['POST'])
def create_event():
    """Internal endpoint called by the detection engine."""
    data = request.get_json(silent=True) or {}

    required = ['zone_id', 'track_id', 'confidence_score', 'behavior_flags',
                'alert_triggered', 'detected_at']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {missing}'}), 400

    event_id = str(uuid.uuid4())
    snapshot_path = None

    # Save snapshot if provided
    snapshot_b64 = data.get('snapshot_base64')
    if snapshot_b64:
        try:
            os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
            img_data = base64.b64decode(snapshot_b64)
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
        except Exception as exc:
            current_app.logger.warning(f'Failed to save snapshot: {exc}')
            snapshot_path = None

    # Parse detected_at
    try:
        detected_at = datetime.fromisoformat(data['detected_at'])
    except (ValueError, TypeError):
        detected_at = datetime.utcnow()

    event = DetectionEvent(
        event_id         = event_id,
        zone_id          = data['zone_id'],
        track_id         = data.get('track_id'),
        confidence_score = data.get('confidence_score'),
        behavior_flags   = data.get('behavior_flags'),
        alert_triggered  = bool(data.get('alert_triggered', False)),
        snapshot_path    = snapshot_path,
        detected_at      = detected_at,
        raw_payload      = data,
    )
    db.session.add(event)

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error saving event: {exc}')
        return jsonify({'error': 'Database error'}), 500
    socketio.emit('camera_status', {'zone_id': event.zone_id, 'status': 'online'})
    socketio.emit('system_status', {
        'component': 'detection_engine',
        'status': 'online',
        'message': f'Event received from {event.zone_id}',
    })

    alert_dict = None
    if event.alert_triggered:
        alert = Alert(
            alert_id     = str(uuid.uuid4()),
            event_id     = event_id,
            zone_id      = event.zone_id,
            status       = 'unacknowledged',
            triggered_at = datetime.utcnow(),
        )
        db.session.add(alert)
        try:
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            current_app.logger.error(f'DB error saving alert: {exc}')
        else:
            # emit AFTER commit so alert_id exists in DB
            alert_dict = _serialize_alert_event_payload(alert, event)
            socketio.emit('alert_event', alert_dict)

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
    page            = int(request.args.get('page', 1))
    limit           = min(int(request.args.get('limit', 20)), 100)

    query = DetectionEvent.query

    if zone_id:
        query = query.filter_by(zone_id=zone_id)
    if from_dt:
        try:
            query = query.filter(DetectionEvent.detected_at >= datetime.fromisoformat(from_dt))
        except ValueError:
            pass
    if to_dt:
        try:
            query = query.filter(DetectionEvent.detected_at <= datetime.fromisoformat(to_dt))
        except ValueError:
            pass
    if alert_triggered is not None:
        flag = alert_triggered.lower() == 'true'
        query = query.filter_by(alert_triggered=flag)

    query = query.order_by(DetectionEvent.detected_at.desc())
    pagination = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'total': pagination.total,
        'page':  page,
        'limit': limit,
        'events': [e.to_dict() for e in pagination.items],
    }), 200
