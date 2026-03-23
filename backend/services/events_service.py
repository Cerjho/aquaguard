"""Service helpers for detection events routes."""

from models import Alert, DetectionEvent
from utils.date_utils import parse_iso_datetime, utcnow_naive


def parse_detected_at(raw_value):
    """Normalize inbound detected_at to UTC-naive datetime for DB storage."""
    parsed = parse_iso_datetime(raw_value)
    return parsed or utcnow_naive()


def apply_event_filters(
    query,
    *,
    zone_id=None,
    from_dt=None,
    to_dt=None,
    alert_triggered=None,
    status=None,
):
    """Apply shared event-list filtering rules."""
    if zone_id:
        query = query.filter(DetectionEvent.zone_id == zone_id)

    parsed_from = parse_iso_datetime(from_dt)
    if parsed_from:
        query = query.filter(DetectionEvent.detected_at >= parsed_from)

    parsed_to = parse_iso_datetime(to_dt)
    if parsed_to:
        query = query.filter(DetectionEvent.detected_at <= parsed_to)

    if alert_triggered is not None:
        should_alert = str(alert_triggered).lower() == "true"
        query = query.filter(DetectionEvent.alert_triggered == should_alert)

    if status:
        normalized_status = str(status).strip().lower()
        if normalized_status == "alerted":
            query = query.filter(DetectionEvent.alert_triggered.is_(True))
        elif normalized_status in {"normal", "clear"}:
            query = query.filter(DetectionEvent.alert_triggered.is_(False))
        elif normalized_status in {"unacknowledged", "acknowledged"}:
            query = query.join(Alert, Alert.event_id == DetectionEvent.event_id).filter(
                Alert.status == normalized_status
            )

    return query
