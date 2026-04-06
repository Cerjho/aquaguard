"""Service helpers for reports routes."""

import threading
import time
from copy import deepcopy

from sqlalchemy import case, func

from models import CameraZone, DetectionEvent

_SUMMARY_CACHE_LOCK = threading.Lock()
_SUMMARY_CACHE = {}
_SUMMARY_CACHE_TTL_SECONDS = 5


def get_cached_summary(cache_key):
    now = time.time()
    with _SUMMARY_CACHE_LOCK:
        cache_entry = _SUMMARY_CACHE.get(cache_key)
        if not cache_entry:
            return None
        if now - cache_entry["created_at"] > _SUMMARY_CACHE_TTL_SECONDS:
            _SUMMARY_CACHE.pop(cache_key, None)
            return None
        # // PERF: return copy to avoid mutating shared cached payload.
        return deepcopy(cache_entry["payload"])


def set_cached_summary(cache_key, payload):
    with _SUMMARY_CACHE_LOCK:
        _SUMMARY_CACHE[cache_key] = {
            "created_at": time.time(),
            "payload": deepcopy(payload),
        }


def compute_summary(query):
    """Compute aggregate summary payload from a DetectionEvent query."""
    # // PERF: combine totals into one aggregate query instead of two COUNT scans.
    aggregate_row = query.with_entities(
        func.count(DetectionEvent.id).label("total_detections"),
        func.sum(case((DetectionEvent.alert_triggered.is_(True), 1), else_=0)).label(
            "confirmed_alerts"
        ),
    ).one()
    total_detections = int(aggregate_row.total_detections or 0)
    confirmed_alerts = int(aggregate_row.confirmed_alerts or 0)
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
    # // PERF: select only fields needed for response to reduce row payload.
    zones = CameraZone.query.with_entities(CameraZone.zone_id, CameraZone.zone_name).all()
    for zone in zones:
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
