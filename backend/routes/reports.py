from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case

from models import DetectionEvent, CameraZone

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1')


def _parse_iso_datetime(raw_value):
    if not raw_value:
        return None
    try:
        return datetime.fromisoformat(str(raw_value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None


@reports_bp.route('/reports/summary', methods=['GET'])
@jwt_required()
def summary():
    from_str = request.args.get('from')
    to_str = request.args.get('to')
    group_by = (request.args.get('group_by') or 'none').lower()

    query = DetectionEvent.query

    parsed_from = _parse_iso_datetime(from_str)
    if parsed_from:
        query = query.filter(DetectionEvent.detected_at >= parsed_from)

    parsed_to = _parse_iso_datetime(to_str)
    if parsed_to:
        query = query.filter(DetectionEvent.detected_at <= parsed_to)

    total_detections = query.count()
    confirmed_alerts = query.filter_by(alert_triggered=True).count()
    false_positives_suppressed = total_detections - confirmed_alerts

    # Keep existing by_zone contract
    zones = CameraZone.query.all()
    by_zone = []
    for zone in zones:
        zone_detections = query.filter_by(zone_id=zone.zone_id).count()
        zone_alerts = query.filter_by(zone_id=zone.zone_id, alert_triggered=True).count()
        by_zone.append({
            'zone_id': zone.zone_id,
            'zone_name': zone.zone_name,
            'detections': zone_detections,
            'alerts': zone_alerts,
        })

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
