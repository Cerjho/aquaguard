"""
backend/routes/reports.py
--------------------------
Reports / analytics blueprint.

Endpoints
---------
GET /api/v1/reports/summary — aggregated detection and alert counts
"""

import logging
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from extensions import db
from models import Alert, CameraZone, DetectionEvent

logger = logging.getLogger(__name__)

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_datetime(value: str):
    """Parse ISO 8601 datetime string to datetime object, or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@reports_bp.route('/reports/summary', methods=['GET'])
@jwt_required()
def summary():
    """
    Return aggregated detection and alert summary statistics.

    Query parameters:
        from     (ISO str, opt)   — start of reporting window
        to       (ISO str, opt)   — end of reporting window
        group_by ('hour'|'day'|'week', default 'day') — time grouping (informational)

    Returns:
        200: {
            from: str | null,
            to: str | null,
            group_by: str,
            total_detections: int,
            confirmed_alerts: int,
            false_positives_suppressed: int,
            by_zone: [{zone_id, zone_name, detections, alerts}]
        }
    """
    from_dt = _parse_datetime(request.args.get('from'))
    to_dt = _parse_datetime(request.args.get('to'))
    group_by = request.args.get('group_by', 'day')

    if group_by not in ('hour', 'day', 'week'):
        group_by = 'day'

    # Default window: last 7 days if not specified
    if from_dt is None:
        from_dt = datetime.utcnow() - timedelta(days=7)
    if to_dt is None:
        to_dt = datetime.utcnow()

    # ── Total detections ──────────────────────────────────────────────────────
    detection_query = DetectionEvent.query.filter(
        DetectionEvent.detected_at >= from_dt,
        DetectionEvent.detected_at <= to_dt,
    )
    total_detections = detection_query.count()

    # ── Confirmed alerts (alert_triggered=True) ───────────────────────────────
    confirmed_alerts = detection_query.filter(
        DetectionEvent.alert_triggered == True  # noqa: E712
    ).count()

    # ── False positives suppressed = detections that did NOT trigger an alert ─
    false_positives_suppressed = total_detections - confirmed_alerts

    # ── Per-zone breakdown ────────────────────────────────────────────────────
    # Aggregate detections per zone
    zone_detections = (
        db.session.query(
            DetectionEvent.zone_id,
            func.count(DetectionEvent.id).label('detections'),
        )
        .filter(
            DetectionEvent.detected_at >= from_dt,
            DetectionEvent.detected_at <= to_dt,
        )
        .group_by(DetectionEvent.zone_id)
        .all()
    )

    # Aggregate confirmed alerts per zone
    zone_alerts = (
        db.session.query(
            Alert.zone_id,
            func.count(Alert.id).label('alerts'),
        )
        .join(
            DetectionEvent,
            Alert.event_id == DetectionEvent.event_id
        )
        .filter(
            DetectionEvent.detected_at >= from_dt,
            DetectionEvent.detected_at <= to_dt,
        )
        .group_by(Alert.zone_id)
        .all()
    )

    # Build lookup maps
    detections_by_zone = {row.zone_id: row.detections for row in zone_detections}
    alerts_by_zone = {row.zone_id: row.alerts for row in zone_alerts}

    # Resolve zone names from CameraZone table
    all_zone_ids = set(detections_by_zone.keys()) | set(alerts_by_zone.keys())
    cameras = CameraZone.query.filter(
        CameraZone.zone_id.in_(list(all_zone_ids))
    ).all() if all_zone_ids else []
    zone_name_map = {c.zone_id: c.zone_name for c in cameras}

    by_zone = [
        {
            'zone_id': zid,
            'zone_name': zone_name_map.get(zid, zid),
            'detections': detections_by_zone.get(zid, 0),
            'alerts': alerts_by_zone.get(zid, 0),
        }
        for zid in sorted(all_zone_ids)
    ]

    return jsonify({
        'from': from_dt.isoformat(),
        'to': to_dt.isoformat(),
        'group_by': group_by,
        'total_detections': total_detections,
        'confirmed_alerts': confirmed_alerts,
        'false_positives_suppressed': false_positives_suppressed,
        'by_zone': by_zone,
    }), 200
