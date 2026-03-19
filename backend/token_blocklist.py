from datetime import datetime, timezone

# Minimal in-memory token blocklist.
# NOTE: This is process-local and suitable for dev/testing.
_REVOKED_JTIS = {}


def revoke_token(jti, expires_at=None):
    if not jti:
        return
    _REVOKED_JTIS[jti] = expires_at


def is_token_revoked(jti):
    if not jti:
        return False

    expires_at = _REVOKED_JTIS.get(jti)
    if expires_at is None and jti in _REVOKED_JTIS:
        return True
    if expires_at is None:
        return False

    now = datetime.now(timezone.utc)
    if expires_at <= now:
        _REVOKED_JTIS.pop(jti, None)
        return False
    return True
