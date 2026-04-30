import logging

from flask import Blueprint, request, jsonify, current_app
from utils.response_utils import success_response, error_response
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import DetectionEvent
from services.alerts_service import build_alerts_query, apply_alert_filters
from utils.date_utils import utcnow_naive

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


def _parse_positive_int(raw_value, default_value):
    try:
        parsed = int(raw_value)
        return parsed if parsed > 0 else default_value
    except (TypeError, ValueError):
        return default_value


def _serialize_alert(event):
    payload = event.to_dict()
    payload['alert_id'] = event.event_id
    payload['triggered_at'] = payload.get('detected_at')
    payload['alerted_at'] = payload.get('detected_at')
    payload['confidence'] = event.confidence_score
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
    query = build_alerts_query(db.session)
    try:
        query = apply_alert_filters(
            query,
            status=status,
            zone_id=zone_id,
            from_dt=from_dt,
            to_dt=to_dt,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
        )
    except ValueError:
        return error_response('min_confidence and max_confidence must be numeric', status_code=400)

    ordered_query = query.order_by(DetectionEvent.detected_at.desc())
    if page_raw is not None or limit_raw is not None:
        page = _parse_positive_int(page_raw, 1)
        limit = _parse_positive_int(limit_raw, 10)
        total = ordered_query.count()
        rows = ordered_query.offset((page - 1) * limit).limit(limit).all()
        return success_response({
            'alerts': [_serialize_alert(event) for event in rows],
            'total': total,
            'page': page,
            'limit': limit,
        })

    rows = ordered_query.all()
    return success_response([
        _serialize_alert(event) for event in rows
    ])



