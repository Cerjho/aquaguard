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
    ping_timeout=60,
    ping_interval=25,
    engineio_logger=False,
    logger=False,
    max_http_buffer_size=1048576,
)
bcrypt   = Bcrypt()
migrate  = Migrate()
cors     = CORS()
DEFAULT_RATE_LIMITS = os.getenv(
    'FLASK_DEFAULT_RATE_LIMITS',
    '2000 per day,300 per hour',
)
RATE_LIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'redis://redis:6379/1')
limiter  = Limiter(
    key_func=get_remote_address,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    default_limits=[
        limit.strip()
        for limit in DEFAULT_RATE_LIMITS.split(',')
        if limit.strip()
    ],
    storage_options={'socket_connect_timeout': 5},
)
