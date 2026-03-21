from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_cors import CORS
import os

db       = SQLAlchemy()
jwt      = JWTManager()

# Read CORS allowed origins from environment variable
cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
# Parse comma-separated list
allowed_origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]

socketio = SocketIO(async_mode='threading', cors_allowed_origins=allowed_origins)
bcrypt   = Bcrypt()
migrate  = Migrate()
cors     = CORS()
