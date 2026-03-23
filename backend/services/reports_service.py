"""Service helpers for reports routes."""

from sqlalchemy import case, func

from models import CameraZone, DetectionEvent


def compute_summary(query):
    """Compute aggregate summary payload from a DetectionEvent query."""
    total_detections = query.count()
    confirmed_alerts = query.filter(DetectionEvent.alert_triggered.is_(True)).count()
    false_positives_suppressed = total_detections - confirmed_alerts

    zone_rows = (
        query.with_entities(
            DetectionEvent.zone_id.label("zone_id"),
            func.count(DetectionEvent.id).label("detections"),
            func.sum(case((DetectionEvent.alert_triggered.is_(True), 1), else_=0)).label("alerts"),
        )
        .group_by(DetectionEvent.zone_id)
        .all()
    )

    zone_map = {
        row.zone_id: {
            "detections": int(row.detections or 0),
            "alerts": int(row.alerts or 0),
        }
        for row in zone_rows
    }

    by_zone = []
    for zone in CameraZone.query.all():
        stats = zone_map.get(zone.zone_id, {"detections": 0, "alerts": 0})
        by_zone.append(
            {
                "zone_id": zone.zone_id,
                "zone_name": zone.zone_name,
                "detections": stats["detections"],
                "alerts": stats["alerts"],
            }
        )

    return {
        "total_detections": total_detections,
        "confirmed_alerts": confirmed_alerts,
        "false_positives_suppressed": false_positives_suppressed,
        "by_zone": by_zone,
    }


def compute_daily_breakdown(query):
    grouped_rows = (
        query.with_entities(
            func.date(DetectionEvent.detected_at).label("date"),
            func.count(DetectionEvent.id).label("detections"),
            func.sum(case((DetectionEvent.alert_triggered.is_(True), 1), else_=0)).label("alerts"),
        )
        .group_by(func.date(DetectionEvent.detected_at))
        .order_by(func.date(DetectionEvent.detected_at))
        .all()
    )

    return [
        {
            "date": str(row.date),
            "detections": int(row.detections or 0),
            "alerts": int(row.alerts or 0),
        }
        for row in grouped_rows
    ]
