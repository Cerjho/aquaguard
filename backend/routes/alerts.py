import logging
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models import Alert, DetectionEvent

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


def _parse_iso_datetime(raw_value):
    if not raw_value:
        return None
    try:
        return datetime.fromisoformat(str(raw_value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None


@alerts_bp.route('/alerts', methods=['GET'])
@jwt_required()
def list_alerts():
    status = request.args.get('status')
    zone_id = request.args.get('zone_id')
    from_dt = request.args.get('from')
    to_dt = request.args.get('to')
    min_confidence = request.args.get('min_confidence')
    max_confidence = request.args.get('max_confidence')
    query  = Alert.query

    if status:
        query = query.filter_by(status=status)
    if zone_id:
        query = query.filter_by(zone_id=zone_id)

    parsed_from = _parse_iso_datetime(from_dt)
    if parsed_from:
        query = query.filter(Alert.triggered_at >= parsed_from)

    parsed_to = _parse_iso_datetime(to_dt)
    if parsed_to:
        query = query.filter(Alert.triggered_at <= parsed_to)

    has_confidence_filter = min_confidence is not None or max_confidence is not None
    if has_confidence_filter:
        query = query.join(DetectionEvent, DetectionEvent.event_id == Alert.event_id)
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

    alerts = query.order_by(Alert.triggered_at.desc()).all()
    return jsonify([a.to_dict() for a in alerts]), 200


@alerts_bp.route('/alerts/<alert_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_alert(alert_id):
    alert = Alert.query.filter_by(alert_id=alert_id).first_or_404()

    if alert.status == 'acknowledged':
        return jsonify({'error': 'Alert already acknowledged'}), 409

    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        user_id = None

    alert.status          = 'acknowledged'
    alert.acknowledged_by = user_id
    alert.acknowledged_at = datetime.utcnow()

    data = request.get_json(silent=True) or {}
    if data.get('notes'):
        alert.notes = data['notes']

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error acknowledging alert: {exc}')
        return jsonify({'error': 'Database error'}), 500

    return jsonify(alert.to_dict()), 200
