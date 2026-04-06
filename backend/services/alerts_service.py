"""Service helpers for alerts routes."""

from models import Alert, DetectionEvent
from utils.date_utils import parse_iso_datetime


def build_alerts_query(session):
    """Base alerts query including confidence_score join for serialization."""
    # // PERF: project only columns needed by list endpoint to avoid
    # over-fetching full DetectionEvent rows during join.
    return session.query(Alert, DetectionEvent.confidence_score).outerjoin(
        DetectionEvent, DetectionEvent.event_id == Alert.event_id
    )


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
    if status:
        query = query.filter(Alert.status == status)
    if zone_id:
        query = query.filter(Alert.zone_id == zone_id)

    parsed_from = parse_iso_datetime(from_dt)
    if parsed_from:
        query = query.filter(Alert.triggered_at >= parsed_from)

    parsed_to = parse_iso_datetime(to_dt)
    if parsed_to:
        query = query.filter(Alert.triggered_at <= parsed_to)

    if min_confidence is not None:
        query = query.filter(DetectionEvent.confidence_score >= float(min_confidence))
    if max_confidence is not None:
        query = query.filter(DetectionEvent.confidence_score <= float(max_confidence))

    return query
