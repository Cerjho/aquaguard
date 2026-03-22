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


socketio = SocketIO(async_mode='threading', cors_allowed_origins=_socketio_allowed_origins())
bcrypt   = Bcrypt()
migrate  = Migrate()
cors     = CORS()
limiter  = Limiter(key_func=get_remote_address)
