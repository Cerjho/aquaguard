from datetime import datetime, timezone
import os
from threading import Lock

import redis

_REVOKED_JTIS = {}
_REVOKED_JTIS_LOCK = Lock()

_redis_client = redis.Redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
    decode_responses=True,
    socket_connect_timeout=1.0,
    socket_timeout=2.0,
    health_check_interval=30,
)


def _fallback_revoke(jti, expires_at=None):
    with _REVOKED_JTIS_LOCK:
        _REVOKED_JTIS[jti] = expires_at


def _fallback_is_revoked(jti):
    with _REVOKED_JTIS_LOCK:
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


def revoke_jti(jti, expires_in_seconds):
    if not jti:
        return
    ttl = max(int(expires_in_seconds or 0), 1)
    try:
        _redis_client.setex(f'revoked:{jti}', ttl, '1')
        return
    except redis.RedisError:
        expires_at = datetime.now(timezone.utc)
        expires_at = expires_at.replace(microsecond=0)
        expires_at = expires_at.fromtimestamp(expires_at.timestamp() + ttl, tz=timezone.utc)
        _fallback_revoke(jti, expires_at)


def revoke_token(jti, expires_at=None, expires_in_seconds=None):
    if not jti:
        return
    if expires_in_seconds is None:
        if expires_at is None:
            expires_in_seconds = 60 * 60
        else:
            seconds = int((expires_at - datetime.now(timezone.utc)).total_seconds())
            expires_in_seconds = max(seconds, 1)
    revoke_jti(jti, expires_in_seconds)


def is_token_revoked(jti):
    if not jti:
        return False
    try:
        return _redis_client.exists(f'revoked:{jti}') > 0
    except redis.RedisError:
        return _fallback_is_revoked(jti)
