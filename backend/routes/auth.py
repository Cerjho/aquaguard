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
    remember_me = data.get('remember_me', False)
    
    current_app.logger.info('Login attempt for user: %s', username)
    
    if not isinstance(remember_me, bool):
        return jsonify({'error': 'remember_me must be a boolean'}), 400

    if not username or not password:
        current_app.logger.warning('Login failed: missing username or password')
        return jsonify({'error': 'username and password required'}), 400

    user = User.query.filter_by(username=username, is_active=True).first()
    
    if not user:
        current_app.logger.warning('Login failed: user "%s" not found or inactive', username)
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not bcrypt.check_password_hash(user.password_hash, password):
        current_app.logger.warning('Login failed: wrong password for user "%s"', username)
        return jsonify({'error': 'Invalid credentials'}), 401
    
    current_app.logger.info('Login SUCCESS for user: %s (id=%s)', username, user.id)

    additional_claims = {'role': user.role}

    # If remember_me is True, use extended token expiration (30 days)
    # Otherwise use default expiration from config
    from datetime import timedelta
    if remember_me:
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims=additional_claims,
            expires_delta=timedelta(days=30)
        )
        refresh_token = create_refresh_token(
            identity=str(user.id),
            additional_claims=additional_claims,
            expires_delta=timedelta(days=30)
        )
    else:
        access_token = create_access_token(
            identity=str(user.id), additional_claims=additional_claims
        )
        refresh_token = create_refresh_token(
            identity=str(user.id), additional_claims=additional_claims
        )

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


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    """
    Get the current authenticated user's profile.
    Used for session restoration on page reload.
    """
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user or not user.is_active:
        return jsonify({'error': 'User not found or inactive'}), 404
    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required(verify_type=False)
def logout():
    current = get_jwt()
    revoke_token(current.get('jti'), expires_in_seconds=_expires_in_from_jwt(current))
    response = jsonify({'message': 'Logged out successfully'})
    unset_jwt_cookies(response)
    return response, 200
