from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import DetectionEvent
from services.reports_service import (
    compute_daily_breakdown,
    compute_summary,
    get_cached_summary,
    set_cached_summary,
)
from utils.date_utils import parse_iso_datetime

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1')


@reports_bp.route('/reports/summary', methods=['GET'])
@jwt_required()
def summary():
    from_str = request.args.get('from')
    to_str = request.args.get('to')
    group_by = (request.args.get('group_by') or 'none').lower()
    cache_key = (from_str or '', to_str or '', group_by)
    # // PERF: short TTL cache avoids repeating expensive aggregates for
    # dashboard refresh bursts with identical filters.
    cached_response = get_cached_summary(cache_key)
    if cached_response is not None:
        return jsonify(cached_response), 200

    query = DetectionEvent.query

    parsed_from = parse_iso_datetime(from_str)
    if parsed_from:
        query = query.filter(DetectionEvent.detected_at >= parsed_from)

    parsed_to = parse_iso_datetime(to_str)
    if parsed_to:
        query = query.filter(DetectionEvent.detected_at <= parsed_to)

    try:
        response = compute_summary(query)
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error('Reports summary query failed: %s', exc)
        response = {
            'total_detections': 0,
            'confirmed_alerts': 0,
            'false_positives_suppressed': 0,
            'by_zone': [],
        }
        if group_by == 'day':
            response['daily'] = []
        return jsonify(response), 200

    if group_by == 'day':
        response['daily'] = compute_daily_breakdown(query)

    set_cached_summary(cache_key, response)
    return jsonify(response), 200
