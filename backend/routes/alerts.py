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


def _parse_positive_int(raw_value, default_value):
    try:
        parsed = int(raw_value)
        return parsed if parsed > 0 else default_value
    except (TypeError, ValueError):
        return default_value


def _serialize_alert(alert, confidence_score):
    payload = alert.to_dict()
    payload['alerted_at'] = payload.get('triggered_at')
    payload['confidence_score'] = confidence_score
    payload['confidence'] = confidence_score
    payload['final_confidence'] = confidence_score
    return payload


@alerts_bp.route('/alerts', methods=['GET'])
@jwt_required()
def list_alerts():
    status = request.args.get('status')
    zone_id = request.args.get('zone_id')
    from_dt = request.args.get('from')
    to_dt = request.args.get('to')
    min_confidence = request.args.get('min_confidence')
    max_confidence = request.args.get('max_confidence')
    page_raw = request.args.get('page')
    limit_raw = request.args.get('limit')
    query = (
        db.session.query(Alert, DetectionEvent.confidence_score)
        .outerjoin(DetectionEvent, DetectionEvent.event_id == Alert.event_id)
    )

    if status:
        query = query.filter(Alert.status == status)
    if zone_id:
        query = query.filter(Alert.zone_id == zone_id)

    parsed_from = _parse_iso_datetime(from_dt)
    if parsed_from:
        query = query.filter(Alert.triggered_at >= parsed_from)

    parsed_to = _parse_iso_datetime(to_dt)
    if parsed_to:
        query = query.filter(Alert.triggered_at <= parsed_to)

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

    ordered_query = query.order_by(Alert.triggered_at.desc())
    if page_raw is not None or limit_raw is not None:
        page = _parse_positive_int(page_raw, 1)
        limit = _parse_positive_int(limit_raw, 10)
        total = ordered_query.count()
        rows = ordered_query.offset((page - 1) * limit).limit(limit).all()
        return jsonify({
            'alerts': [_serialize_alert(alert, confidence) for alert, confidence in rows],
            'total': total,
            'page': page,
            'limit': limit,
        }), 200

    rows = ordered_query.all()
    return jsonify([
        _serialize_alert(alert, confidence) for alert, confidence in rows
    ]), 200


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
