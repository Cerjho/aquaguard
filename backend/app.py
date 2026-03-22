import os
from datetime import timedelta
from flask import Flask
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

from config.secrets import get_secret
from extensions import db, jwt, socketio, bcrypt, migrate, cors, limiter
from token_blocklist import is_token_revoked
from utils.logging_utils import configure_app_logging


def create_app():
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

    app = Flask(__name__)
    configure_app_logging(app)

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
    app.config['JWT_TOKEN_LOCATION'] = ['headers', 'cookies']
    app.config['JWT_COOKIE_SECURE'] = os.environ.get('JWT_COOKIE_SECURE', 'false').lower() in {
        '1', 'true', 'yes'
    }
    app.config['JWT_COOKIE_SAMESITE'] = os.environ.get('JWT_COOKIE_SAMESITE', 'Lax')
    app.config['JWT_COOKIE_CSRF_PROTECT'] = True
    app.config['JWT_ACCESS_COOKIE_PATH'] = '/'
    app.config['JWT_REFRESH_COOKIE_PATH'] = '/api/v1/auth/refresh'
    app.config['JWT_CSRF_METHODS'] = ['POST', 'PUT', 'PATCH', 'DELETE']
    app.config['RATELIMIT_ENABLED'] = os.environ.get('RATELIMIT_ENABLED', 'true').lower() in {
        '1', 'true', 'yes'
    }
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'sqlite:///aquaguard.db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEBRTC_SESSION_TTL_SECONDS'] = os.environ.get('WEBRTC_SESSION_TTL_SECONDS', 300)
    app.config['WEBRTC_STUN_URLS'] = os.environ.get(
        'WEBRTC_STUN_URLS', 'stun:stun.l.google.com:19302'
    )
    app.config['WEBRTC_TURN_URL'] = os.environ.get('WEBRTC_TURN_URL')
    app.config['WEBRTC_TURN_USERNAME'] = os.environ.get('WEBRTC_TURN_USERNAME')
    app.config['WEBRTC_TURN_CREDENTIAL'] = os.environ.get(
        'WEBRTC_TURN_CREDENTIAL'
    ) or os.environ.get('WEBRTC_TURN_PASSWORD')
    app.config['WEBRTC_ICE_TRANSPORT_POLICY'] = os.environ.get(
        'WEBRTC_ICE_TRANSPORT_POLICY', 'all'
    )
    app.config['WEBRTC_FORCE_RELAY'] = os.environ.get('WEBRTC_FORCE_RELAY', 'false')
    app.config['WEBRTC_FUTURE_TIMEOUT_SECONDS'] = os.environ.get(
        'WEBRTC_FUTURE_TIMEOUT_SECONDS', 20
    )
    app.config['WEBRTC_ICE_GATHERING_TIMEOUT_SECONDS'] = os.environ.get(
        'WEBRTC_ICE_GATHERING_TIMEOUT_SECONDS', 3
    )

    # Init extensions
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
    allowed_origins_raw = os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
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
