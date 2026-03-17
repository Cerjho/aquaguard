"""
backend/app.py
--------------
Flask application factory. Imports extensions from extensions.py,
configures the app, registers blueprints, and initialises all extensions.
"""

import os
from flask import Flask
from dotenv import load_dotenv

from extensions import db, jwt, socketio, bcrypt, migrate, cors


def create_app(test_config: dict = None) -> Flask:
    """
    Application factory.

    Args:
        test_config: Optional dict of config overrides (used by conftest.py).

    Returns:
        Configured Flask application instance.
    """
    # Load .env from the backend directory
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

    app = Flask(__name__)

    # ── Core configuration ────────────────────────────────────────────────────
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'fallback-secret-key')
    app.config['JWT_SECRET_KEY'] = os.getenv(
        'JWT_SECRET_KEY', 'fallback-jwt-secret-key'
    )
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL', 'sqlite:///aquaguard.db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    # Override with test config if provided
    if test_config is not None:
        app.config.update(test_config)

    # ── Initialise extensions ──────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    # R6-C: pass async_mode and cors_allowed_origins again at init time
    socketio.init_app(app, cors_allowed_origins="*", async_mode='threading')
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, origins=["http://localhost:3000"])

    # ── Register blueprints ───────────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.events import events_bp
    from routes.alerts import alerts_bp
    from routes.cameras import cameras_bp
    from routes.reports import reports_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(cameras_bp)
    app.register_blueprint(reports_bp)

    # ── Register SocketIO event handlers ─────────────────────────────────────
    import sockets  # noqa: F401 — side-effect import registers handlers

    return app
