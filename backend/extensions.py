import os

from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db       = SQLAlchemy()
jwt      = JWTManager()


def _socketio_allowed_origins():
    raw = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
    origins = [origin.strip() for origin in str(raw).split(',') if origin.strip()]
    return origins or ['http://localhost:3000']


socketio = SocketIO(
    async_mode='threading',
    cors_allowed_origins=_socketio_allowed_origins(),
    # CRITICAL: Extend ping timeouts to prevent disconnections during heavy load
    # Default ping_timeout is 20s, ping_interval is 25s - too short for life-safety system
    ping_timeout=60,      # Time to wait for pong before considering connection dead
    ping_interval=25,     # How often to send ping frames
)
bcrypt   = Bcrypt()
migrate  = Migrate()
cors     = CORS()
DEFAULT_RATE_LIMITS = os.getenv(
    'FLASK_DEFAULT_RATE_LIMITS',
    '2000 per day,300 per hour',
)
RATE_LIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
limiter  = Limiter(
    key_func=get_remote_address,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    default_limits=[
        limit.strip()
        for limit in DEFAULT_RATE_LIMITS.split(',')
        if limit.strip()
    ],
)
