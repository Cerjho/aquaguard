"""
backend/extensions.py
---------------------
All Flask extension instances are created here — import from this module
in app.py and all route files to avoid circular imports and duplicate instances.

CRITICAL (R6-C): socketio MUST use async_mode='threading' — without this,
WebSocket connections will hang or fail in threaded environments.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_cors import CORS

db = SQLAlchemy()
jwt = JWTManager()
# R6-C: async_mode='threading' is mandatory
socketio = SocketIO(async_mode='threading', cors_allowed_origins="*")
bcrypt = Bcrypt()
migrate = Migrate()
cors = CORS()
