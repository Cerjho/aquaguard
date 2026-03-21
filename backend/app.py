import os
from datetime import timedelta
from flask import Flask
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

from extensions import db, jwt, socketio, bcrypt, migrate, cors, limiter
from token_blocklist import is_token_revoked


def create_app():
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

    app = Flask(__name__)

    secret_key = os.environ.get('SECRET_KEY')
    jwt_secret_key = os.environ.get('JWT_SECRET_KEY')
    if not secret_key:
        raise RuntimeError('SECRET_KEY environment variable is required')
    if not jwt_secret_key:
        raise RuntimeError('JWT_SECRET_KEY environment variable is required')

    app.config['SECRET_KEY'] = secret_key
    app.config['JWT_SECRET_KEY'] = jwt_secret_key
    app.config['AQUAGUARD_API_KEY'] = os.environ.get('AQUAGUARD_API_KEY')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=60)
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=7)
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
    cors.init_app(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})
    socketio.init_app(app)
    limiter.init_app(app)

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
