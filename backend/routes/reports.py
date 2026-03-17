from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from extensions import db
from models import DetectionEvent, Alert, CameraZone

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1')


@reports_bp.route('/reports/summary', methods=['GET'])
@jwt_required()
def summary():
    from_str  = request.args.get('from')
    to_str    = request.args.get('to')
    # group_by reserved for future use
    # group_by = request.args.get('group_by', 'day')

    query = DetectionEvent.query
    alert_query = Alert.query

    if from_str:
        try:
            from_dt = datetime.fromisoformat(from_str)
            query = query.filter(DetectionEvent.detected_at >= from_dt)
            alert_query = alert_query.filter(Alert.triggered_at >= from_dt)
        except ValueError:
            pass
    if to_str:
        try:
            to_dt = datetime.fromisoformat(to_str)
            query = query.filter(DetectionEvent.detected_at <= to_dt)
            alert_query = alert_query.filter(Alert.triggered_at <= to_dt)
        except ValueError:
            pass

    total_detections           = query.count()
    confirmed_alerts           = query.filter_by(alert_triggered=True).count()
    false_positives_suppressed = total_detections - confirmed_alerts

    # Per-zone breakdown
    zones = CameraZone.query.all()
    by_zone = []
    for zone in zones:
        zone_detections = query.filter_by(zone_id=zone.zone_id).count()
        zone_alerts     = query.filter_by(zone_id=zone.zone_id, alert_triggered=True).count()
        by_zone.append({
            'zone_id':    zone.zone_id,
            'zone_name':  zone.zone_name,
            'detections': zone_detections,
            'alerts':     zone_alerts,
        })

    return jsonify({
        'total_detections':           total_detections,
        'confirmed_alerts':           confirmed_alerts,
        'false_positives_suppressed': false_positives_suppressed,
        'by_zone':                    by_zone,
    }), 200
