import os
import sys
from datetime import timedelta
from flask import Flask
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

# Allow imports from project-root modules (e.g., config/) when running from backend/.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from config.secrets import get_secret
from config.settings import (
    build_backend_runtime_values,
    get_backend_config,
    resolve_backend_environment,
    validate_runtime_settings,
)
from extensions import db, jwt, socketio, bcrypt, migrate, cors, limiter
from token_blocklist import is_token_revoked
from utils.logging_utils import configure_app_logging
from utils.error_reporting import init_error_reporting


def create_app():
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
    validate_runtime_settings()

    app = Flask(__name__)
    configure_app_logging(app)
    env_name = resolve_backend_environment()
    app.config.from_object(get_backend_config(env_name))
    app.config.update(build_backend_runtime_values())
    init_error_reporting(app)

    secret_key = get_secret('SECRET_KEY')
    jwt_secret_key = get_secret('JWT_SECRET_KEY')
    api_key = get_secret('AQUAGUARD_API_KEY')
    if not secret_key:
        raise RuntimeError('SECRET_KEY or SECRET_KEY_FILE is required')
    if not jwt_secret_key:
        raise RuntimeError('JWT_SECRET_KEY or JWT_SECRET_KEY_FILE is required')
    if not api_key:
        raise RuntimeError('AQUAGUARD_API_KEY or AQUAGUARD_API_KEY_FILE is required')

    app.config['SECRET_KEY'] = secret_key
    app.config['JWT_SECRET_KEY'] = jwt_secret_key
    app.config['AQUAGUARD_API_KEY'] = api_key
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=60)
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=7)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'sqlite:///aquaguard.db'
    )

    # Init extensions
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
    allowed_origins_raw = app.config.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
    allowed_origins = [
        origin.strip() for origin in allowed_origins_raw.split(',') if origin.strip()
    ] or ['http://localhost:3000']
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
        supports_credentials=True,
    )
    socketio.init_app(app, cors_allowed_origins=allowed_origins)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        return is_token_revoked(jwt_payload.get('jti'))

    # Register blueprints
    from routes.auth import auth_bp
    from routes.events import events_bp
    from routes.alerts import alerts_bp
    from routes.cameras import cameras_bp
    from routes.reports import reports_bp
    from routes.system import system_bp
    from routes.webrtc import webrtc_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(cameras_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(webrtc_bp)

    # Register SocketIO handlers
    import sockets  # noqa: F401

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc):
        return {
            'error': exc.name,
            'message': exc.description,
        }, exc.code

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc):
        app.logger.exception('Unhandled server error: %s', exc)
        return {
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred.',
        }, 500

    return app
