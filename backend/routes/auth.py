from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)
from extensions import bcrypt, db, limiter
from models import User
from token_blocklist import revoke_token

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


def _expires_in_from_jwt(payload):
    exp = payload.get('exp') if payload else None
    if not exp:
        return 60 * 60
    try:
        expiry = datetime.fromtimestamp(float(exp), tz=timezone.utc)
        return max(int((expiry - datetime.now(timezone.utc)).total_seconds()), 1)
    except (TypeError, ValueError, OSError):
        return 60 * 60


@auth_bp.route('/login', methods=['POST'])
@limiter.limit('5 per minute', exempt_when=lambda: current_app.config.get('TESTING', False))
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'username and password required'}), 400

    user = User.query.filter_by(username=username, is_active=True).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    additional_claims = {'role': user.role}
    access_token  = create_access_token(identity=str(user.id), additional_claims=additional_claims)
    refresh_token = create_refresh_token(identity=str(user.id), additional_claims=additional_claims)

    response = jsonify({
        'access_token':  access_token,
        'refresh_token': refresh_token,
        'user':          user.to_dict(),
    })
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return response, 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    current = get_jwt()
    revoke_token(current.get('jti'), expires_in_seconds=_expires_in_from_jwt(current))
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    additional_claims = {'role': user.role}
    access_token = create_access_token(identity=identity, additional_claims=additional_claims)
    response = jsonify({'access_token': access_token})
    set_access_cookies(response, access_token)
    return response, 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required(verify_type=False)
def logout():
    current = get_jwt()
    revoke_token(current.get('jti'), expires_in_seconds=_expires_in_from_jwt(current))
    response = jsonify({'message': 'Logged out successfully'})
    unset_jwt_cookies(response)
    return response, 200
