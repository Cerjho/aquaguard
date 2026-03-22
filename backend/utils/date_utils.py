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
