from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, current_app
from utils.response_utils import success_response, error_response
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
        return error_response('remember_me must be a boolean', status_code=400)

    if not username or not password:
        current_app.logger.warning('Login failed: missing username or password')
        return error_response('username and password required', status_code=400)

    user = User.query.filter_by(username=username, is_active=True).first()

    if not user:
        current_app.logger.warning('Login failed: user "%s" not found or inactive', username)
        return error_response('Invalid credentials', status_code=401)

    if not bcrypt.check_password_hash(user.password_hash, password):
        current_app.logger.warning('Login failed: wrong password for user "%s"', username)
        return error_response('Invalid credentials', status_code=401)

    current_app.logger.info('Login SUCCESS for user: %s (id=%s)', username, user.id)

    additional_claims = {'role': user.role}

    # If remember_me is True, use extended token expiration (30 days)
    # Otherwise use default expiration from config
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
        return error_response('User not found', status_code=404)

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
        return error_response('User not found or inactive', status_code=404)
    return success_response({'user': user.to_dict()})


@auth_bp.route('/logout', methods=['POST'])
@jwt_required(verify_type=False)
def logout():
    current = get_jwt()
    revoke_token(current.get('jti'), expires_in_seconds=_expires_in_from_jwt(current))
    response = jsonify({'message': 'Logged out successfully'})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
@limiter.limit('5 per minute', exempt_when=lambda: current_app.config.get('TESTING', False))
def change_password():
    """
    Change the authenticated user's password.

    Body JSON:
        current_password (str): the user's existing password
        new_password     (str): the desired new password (min 8 chars)
    """
    data = request.get_json(silent=True) or {}
    current_pw = data.get('current_password', '')
    new_pw = data.get('new_password', '')

    if not current_pw or not new_pw:
        return error_response('current_password and new_password are required', status_code=400)

    if len(new_pw) < 8:
        return error_response('New password must be at least 8 characters', status_code=400)

    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user or not user.is_active:
        return error_response('User not found', status_code=404)

    if not bcrypt.check_password_hash(user.password_hash, current_pw):
        current_app.logger.warning(
            'change_password: wrong current password for user id=%s', identity
        )
        return error_response('Current password is incorrect', status_code=401)

    if bcrypt.check_password_hash(user.password_hash, new_pw):
        return error_response('New password must differ from the current password', status_code=400)

    user.password_hash = bcrypt.generate_password_hash(new_pw).decode('utf-8')
    db.session.commit()

    current_app.logger.info('Password changed for user id=%s', identity)
    return success_response(None, message='Password updated successfully')
