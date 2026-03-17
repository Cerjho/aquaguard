from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_cors import CORS

db       = SQLAlchemy()
jwt      = JWTManager()
socketio = SocketIO(async_mode='threading', cors_allowed_origins="*")
bcrypt   = Bcrypt()
migrate  = Migrate()
cors     = CORS()
