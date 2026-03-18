import os
import base64
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

from extensions import db, socketio
from models import DetectionEvent, Alert

events_bp = Blueprint('events', __name__, url_prefix='/api/v1')

SNAPSHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'snapshots')


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
            with open(snapshot_path, 'wb') as f:
                f.write(img_data)
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
            alert_dict = alert.to_dict()
            socketio.emit('alert_event', alert_dict)

    result = event.to_dict()
    if alert_dict:
        result['alert'] = alert_dict
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
