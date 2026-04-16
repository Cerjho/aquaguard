from datetime import datetime, timezone
import os
import time
from threading import Lock

import redis

_REVOKED_JTIS = {}
_REVOKED_JTIS_LOCK = Lock()
_REDIS_STATE_LOCK = Lock()


def _env_float(name, default):
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == '':
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name, default):
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == '':
        return default
    return str(raw).strip().lower() in {'1', 'true', 'yes', 'on'}


_APP_ENV = str(
    os.getenv('APP_ENV') or os.getenv('FLASK_ENV') or 'development'
).strip().lower()
_DEFAULT_FAIL_CLOSED = _APP_ENV == 'production'
_TOKEN_BLOCKLIST_FAIL_CLOSED = _env_bool(
    'TOKEN_BLOCKLIST_FAIL_CLOSED',
    _DEFAULT_FAIL_CLOSED,
)


_REDIS_CONNECT_TIMEOUT_SECONDS = _env_float(
    'REDIS_CONNECT_TIMEOUT_SECONDS',
    0.25,
)
_REDIS_SOCKET_TIMEOUT_SECONDS = _env_float(
    'REDIS_SOCKET_TIMEOUT_SECONDS',
    0.25,
)
_REDIS_FAILURE_COOLDOWN_SECONDS = _env_float(
    'REDIS_FAILURE_COOLDOWN_SECONDS',
    1.0,
)

_redis_retry_after_monotonic = 0.0

_redis_client = redis.Redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
    decode_responses=True,
    socket_connect_timeout=max(_REDIS_CONNECT_TIMEOUT_SECONDS, 0.01),
    socket_timeout=max(_REDIS_SOCKET_TIMEOUT_SECONDS, 0.01),
    retry_on_timeout=False,
)


def _redis_is_temporarily_disabled():
    with _REDIS_STATE_LOCK:
        return time.monotonic() < _redis_retry_after_monotonic


def _mark_redis_failure():
    global _redis_retry_after_monotonic
    with _REDIS_STATE_LOCK:
        _redis_retry_after_monotonic = (
            time.monotonic() + max(_REDIS_FAILURE_COOLDOWN_SECONDS, 0.0)
        )


def _mark_redis_success():
    global _redis_retry_after_monotonic
    with _REDIS_STATE_LOCK:
        _redis_retry_after_monotonic = 0.0


def _resolve_revocation_when_redis_unavailable(jti):
    if _TOKEN_BLOCKLIST_FAIL_CLOSED:
        return True
    return _fallback_is_revoked(jti)


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
    if _redis_is_temporarily_disabled():
        expires_at = datetime.now(timezone.utc)
        expires_at = expires_at.replace(microsecond=0)
        expires_at = expires_at.fromtimestamp(expires_at.timestamp() + ttl, tz=timezone.utc)
        _fallback_revoke(jti, expires_at)
        return
    try:
        _redis_client.setex(f'revoked:{jti}', ttl, '1')
        _mark_redis_success()
        return
    except redis.RedisError:
        _mark_redis_failure()
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
    if _redis_is_temporarily_disabled():
        return _resolve_revocation_when_redis_unavailable(jti)
    try:
        revoked = _redis_client.exists(f'revoked:{jti}') > 0
        _mark_redis_success()
        return revoked
    except redis.RedisError:
        _mark_redis_failure()
        return _resolve_revocation_when_redis_unavailable(jti)
