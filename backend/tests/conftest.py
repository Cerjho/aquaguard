"""
backend/tests/conftest.py
--------------------------
Pytest fixtures for all backend tests.

CRITICAL (R6-J): This file MUST exist before any test file is created.
                 All test files depend on the fixtures defined here.

Fixtures
--------
app        — Flask app configured with an in-memory SQLite test database
client     — Flask test client (no auth)
db         — SQLAlchemy database bound to the test app
admin_token     — JWT access token with role='admin'
lifeguard_token — JWT access token with role='lifeguard'
admin_user      — Seeded User row with role='admin'
lifeguard_user  — Seeded User row with role='lifeguard'
"""

import os
import sys

import pytest

# Ensure imports resolve from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope='session')
def app():
    """
    Create a Flask application instance configured for testing.

    Uses an in-memory SQLite database so tests never touch the dev DB.
    """
    from app import create_app

    test_config = {
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-jwt-secret-not-for-production',
        'SECRET_KEY': 'test-secret-key-not-for-production',
        'WTF_CSRF_ENABLED': False,
    }
    _app = create_app(test_config)
    return _app


@pytest.fixture(scope='session')
def _db(app):
    """Create all tables in the in-memory test database."""
    from extensions import db as _database

    with app.app_context():
        _database.create_all()
        yield _database
        _database.drop_all()


# Alias for tests that import `db` directly
@pytest.fixture(scope='session')
def db(_db):
    return _db


@pytest.fixture(scope='function', autouse=False)
def client(app):
    """Flask test client (unauthenticated)."""
    with app.test_client() as c:
        yield c


@pytest.fixture(scope='session')
def admin_user(app, _db):
    """Create and return an admin User row."""
    from extensions import bcrypt
    from models import User

    with app.app_context():
        existing = User.query.filter_by(username='test_admin').first()
        if existing:
            return existing

        # R6-I: always decode bcrypt hash
        hashed = bcrypt.generate_password_hash('admin_pass').decode('utf-8')
        user = User(
            username='test_admin',
            password_hash=hashed,
            role='admin',
            is_active=True,
        )
        _db.session.add(user)
        _db.session.commit()
        # Refresh to get the auto-assigned id inside this session
        _db.session.refresh(user)
        return user


@pytest.fixture(scope='session')
def lifeguard_user(app, _db):
    """Create and return a lifeguard User row."""
    from extensions import bcrypt
    from models import User

    with app.app_context():
        existing = User.query.filter_by(username='test_lifeguard').first()
        if existing:
            return existing

        hashed = bcrypt.generate_password_hash('guard_pass').decode('utf-8')
        user = User(
            username='test_lifeguard',
            password_hash=hashed,
            role='lifeguard',
            is_active=True,
        )
        _db.session.add(user)
        _db.session.commit()
        _db.session.refresh(user)
        return user


@pytest.fixture(scope='session')
def admin_token(app, admin_user):
    """Return a valid JWT access token for the admin user."""
    from flask_jwt_extended import create_access_token

    with app.app_context():
        token = create_access_token(
            identity=str(admin_user.id),
            additional_claims={'role': 'admin'},
        )
        return token


@pytest.fixture(scope='session')
def lifeguard_token(app, lifeguard_user):
    """Return a valid JWT access token for the lifeguard user."""
    from flask_jwt_extended import create_access_token

    with app.app_context():
        token = create_access_token(
            identity=str(lifeguard_user.id),
            additional_claims={'role': 'lifeguard'},
        )
        return token


# ── Convenience auth header helper ───────────────────────────────────────────

def auth_header(token: str) -> dict:
    """Return an Authorization header dict for use with Flask test client."""
    return {'Authorization': f'Bearer {token}'}
