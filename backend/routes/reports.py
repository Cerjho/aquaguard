from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import DetectionEvent, CameraZone
from utils.date_utils import parse_iso_datetime

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1')


@reports_bp.route('/reports/summary', methods=['GET'])
@jwt_required()
def summary():
    from_str = request.args.get('from')
    to_str = request.args.get('to')
    group_by = (request.args.get('group_by') or 'none').lower()

    query = DetectionEvent.query

    parsed_from = parse_iso_datetime(from_str)
    if parsed_from:
        query = query.filter(DetectionEvent.detected_at >= parsed_from)

    parsed_to = parse_iso_datetime(to_str)
    if parsed_to:
        query = query.filter(DetectionEvent.detected_at <= parsed_to)

    try:
        total_detections = query.count()
        confirmed_alerts = query.filter_by(alert_triggered=True).count()
        false_positives_suppressed = total_detections - confirmed_alerts

        zone_rows = (
            query.with_entities(
                DetectionEvent.zone_id.label('zone_id'),
                func.count(DetectionEvent.id).label('detections'),
                func.sum(
                    case((DetectionEvent.alert_triggered.is_(True), 1), else_=0)
                ).label('alerts'),
            )
            .group_by(DetectionEvent.zone_id)
            .all()
        )
        zone_map = {
            row.zone_id: {
                'detections': int(row.detections or 0),
                'alerts': int(row.alerts or 0),
            }
            for row in zone_rows
        }

        zones = CameraZone.query.all()
        by_zone = []
        for zone in zones:
            zone_stats = zone_map.get(zone.zone_id, {'detections': 0, 'alerts': 0})
            by_zone.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'detections': zone_stats['detections'],
                'alerts': zone_stats['alerts'],
            })
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

    response = {
        'total_detections': total_detections,
        'confirmed_alerts': confirmed_alerts,
        'false_positives_suppressed': false_positives_suppressed,
        'by_zone': by_zone,
    }

    if group_by == 'day':
        grouped_rows = (
            query.with_entities(
                func.date(DetectionEvent.detected_at).label('date'),
                func.count(DetectionEvent.id).label('detections'),
                func.sum(
                    case((DetectionEvent.alert_triggered.is_(True), 1), else_=0)
                ).label('alerts'),
            )
            .group_by(func.date(DetectionEvent.detected_at))
            .order_by(func.date(DetectionEvent.detected_at))
            .all()
        )

        response['daily'] = [
            {
                'date': str(row.date),
                'detections': int(row.detections or 0),
                'alerts': int(row.alerts or 0),
            }
            for row in grouped_rows
        ]

    return jsonify(response), 200
