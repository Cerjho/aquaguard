from utils.date_utils import parse_iso_datetime


def test_parse_iso_datetime_accepts_z_suffix():
    parsed = parse_iso_datetime('2026-03-22T10:00:00Z')
    assert parsed is not None
    assert parsed.tzinfo is None
    assert parsed.isoformat() == '2026-03-22T10:00:00'


def test_parse_iso_datetime_returns_none_for_invalid_value():
    assert parse_iso_datetime('not-a-date') is None
    assert parse_iso_datetime(None) is None
