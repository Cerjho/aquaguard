"""
conftest.py — MUST be created before any test file.
Provides pytest fixtures: app, client, db session, and JWT tokens.
"""
import os
import tempfile
import pytest
from app import create_app
from extensions import db as _db, bcrypt
from models import User

# Use a temp file for SQLite so all connections share the same data
_db_fd, _db_path = tempfile.mkstemp(suffix='.db')
os.close(_db_fd)


@pytest.fixture(scope='session')
def app():
    os.environ['DATABASE_URL'] = f'sqlite:///{_db_path}'
    os.environ['SECRET_KEY'] = 'test-secret-key-32-bytes-long!!'
    os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-key-32-bytes-long!!'
    os.environ['AQUAGUARD_API_KEY'] = 'test-internal-api-key'
    os.environ['RATELIMIT_ENABLED'] = 'false'
    os.environ['RESET_DEFAULT_PASSWORDS_ON_STARTUP'] = '0'
    app = create_app()
    app.config.update({
        'TESTING':                   True,
        'SQLALCHEMY_DATABASE_URI':   f'sqlite:///{_db_path}',
        'JWT_SECRET_KEY':            'test-jwt-secret-key-32-bytes-long!!',
        'WTF_CSRF_ENABLED':          False,
    })
    with app.app_context():
        _db.create_all()
        _seed_users()
        yield app
        _db.drop_all()
        _db.session.remove()
        _db.engine.dispose()
    os.unlink(_db_path)


def _seed_users():
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(username='admin', password_hash='', role='admin')
        _db.session.add(admin)
    admin.password_hash = bcrypt.generate_password_hash('adminpass').decode('utf-8')
    admin.role = 'admin'
    admin.is_active = True

    guard = User.query.filter_by(username='guard').first()
    if not guard:
        guard = User(username='guard', password_hash='', role='lifeguard')
        _db.session.add(guard)
    guard.password_hash = bcrypt.generate_password_hash('guardpass').decode('utf-8')
    guard.role = 'lifeguard'
    guard.is_active = True

    _db.session.commit()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    with app.app_context():
        yield _db


@pytest.fixture()
def admin_token(client):
    resp = client.post('/api/v1/auth/login', json={
        'username': 'admin',
        'password': 'adminpass',
    })
    return resp.get_json()['access_token']


@pytest.fixture()
def guard_token(client):
    resp = client.post('/api/v1/auth/login', json={
        'username': 'guard',
        'password': 'guardpass',
    })
    return resp.get_json()['access_token']
