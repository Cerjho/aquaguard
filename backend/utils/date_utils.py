from datetime import datetime, timezone


def parse_iso_datetime(raw_value):
    if not raw_value:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw_value).replace('Z', '+00:00'))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except (TypeError, ValueError):
        return None


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def serialize_datetime(dt):
    """Serialize a naive-UTC datetime to an ISO 8601 string with 'Z' suffix.

    All datetimes stored in the AquaGuard database are UTC but stored as
    naive (tzinfo=None) objects.  Plain ``.isoformat()`` produces strings
    like ``2026-05-04T08:36:48`` without any timezone indicator.  When the
    frontend calls ``new Date("2026-05-04T08:36:48")``, JavaScript treats
    the value as **local time** (e.g. PHT UTC+8), which shifts the
    displayed time by the local UTC offset.

    This helper appends ``Z`` so the browser correctly interprets the
    timestamp as UTC and converts it to the user's local timezone via
    ``toLocaleString()``.
    """
    if dt is None:
        return None
    iso = dt.isoformat()
    # Already has timezone info (aware datetime) — return as-is
    if dt.tzinfo is not None:
        return iso
    # Naive datetime assumed UTC — append 'Z'
    return iso + 'Z'
