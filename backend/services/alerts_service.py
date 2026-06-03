"""Service helpers for alerts routes."""

from models import DetectionEvent
from utils.date_utils import parse_iso_datetime


def build_alerts_query(session):
    """Base alerts query."""
    return session.query(DetectionEvent).filter(DetectionEvent.alert_triggered.is_(True))


def apply_alert_filters(
    query,
    *,
    status=None,
    zone_id=None,
    from_dt=None,
    to_dt=None,
    min_confidence=None,
    max_confidence=None,
):
    """Apply shared alert-list filtering rules."""
    # We no longer have 'status', but we can ignore it or leave it. The UI doesn't send it unless filtering by unacknowledged.
    # Since all alerts are ephemeral, we ignore 'status'.

    if zone_id:
        query = query.filter(DetectionEvent.zone_id == zone_id)

    parsed_from = parse_iso_datetime(from_dt)
    if parsed_from:
        query = query.filter(DetectionEvent.detected_at >= parsed_from)

    parsed_to = parse_iso_datetime(to_dt)
    if parsed_to:
        query = query.filter(DetectionEvent.detected_at <= parsed_to)

    if min_confidence is not None:
        query = query.filter(DetectionEvent.confidence_score >= float(min_confidence))
    if max_confidence is not None:
        query = query.filter(DetectionEvent.confidence_score <= float(max_confidence))

    return query
