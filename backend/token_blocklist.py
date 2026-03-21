import os
import threading
from datetime import datetime, timezone

# Redis-backed token blocklist for production
# Falls back to in-memory dict for development/testing
try:
    import redis
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    redis_client = redis.from_url(REDIS_URL, decode_responses=False)
    # Test connection
    redis_client.ping()
    USE_REDIS = True
except (ImportError, redis.exceptions.ConnectionError, redis.exceptions.RedisError):
    redis_client = None
    USE_REDIS = False

# In-memory fallback with thread safety
_REVOKED_JTIS = {}
_REVOKED_LOCK = threading.Lock()


def revoke_token(jti, expires_at=None):
    """Revoke a token by its JTI.

    Args:
        jti: JWT ID to revoke
        expires_at: Expiration datetime (used to set TTL in Redis)
    """
    if not jti:
        return

    if USE_REDIS:
        try:
            # Calculate TTL in seconds
            if expires_at:
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                ttl_seconds = int((expires_at - datetime.now(timezone.utc)).total_seconds())
                if ttl_seconds > 0:
                    redis_client.setex(f'revoked:{jti}', ttl_seconds, '1')
                else:
                    # Already expired, no need to store
                    return
            else:
                # No expiration, store indefinitely
                redis_client.set(f'revoked:{jti}', '1')
        except (redis.exceptions.ConnectionError, redis.exceptions.RedisError):
            # Fall back to in-memory if Redis fails
            with _REVOKED_LOCK:
                _REVOKED_JTIS[jti] = expires_at
    else:
        with _REVOKED_LOCK:
            _REVOKED_JTIS[jti] = expires_at


def is_token_revoked(jti):
    """Check if a token has been revoked.

    Args:
        jti: JWT ID to check

    Returns:
        True if token is revoked, False otherwise
    """
    if not jti:
        return False

    if USE_REDIS:
        try:
            return redis_client.exists(f'revoked:{jti}') > 0
        except (redis.exceptions.ConnectionError, redis.exceptions.RedisError):
            # Fall back to in-memory if Redis fails
            with _REVOKED_LOCK:
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
    else:
        with _REVOKED_LOCK:
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
