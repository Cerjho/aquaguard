"""
backend/routes/auth.py
----------------------
Authentication blueprint.

Endpoints
---------
POST /api/v1/auth/login    — verify credentials, return access + refresh tokens
POST /api/v1/auth/refresh  — issue new access token using a valid refresh token
POST /api/v1/auth/logout   — client-side token deletion (returns 200)
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
)

from extensions import bcrypt
from models import User

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate a user and return JWT tokens.

    Request body (JSON):
        username (str): plaintext username
        password (str): plaintext password

    Returns:
        200: {access_token, refresh_token, user: {id, username, role}}
        400: missing fields
        401: invalid credentials
    """
    data = request.get_json(silent=True) or {}

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    user = User.query.filter_by(username=username, is_active=True).first()
    if user is None or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid username or password'}), 401

    # Embed role in JWT claims so role_required() can inspect it without a DB hit
    additional_claims = {'role': user.role}

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims
    )
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims=additional_claims
    )

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': user.to_dict(),
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Issue a new access token using a valid refresh token.

    Requires:
        Authorization: Bearer <refresh_token>

    Returns:
        200: {access_token}
    """
    current_user_id = get_jwt_identity()
    # Re-query so we pick up any role changes since the refresh token was issued
    user = User.query.get(int(current_user_id))
    if user is None or not user.is_active:
        return jsonify({'error': 'User not found or inactive'}), 401

    additional_claims = {'role': user.role}
    new_access_token = create_access_token(
        identity=current_user_id,
        additional_claims=additional_claims
    )
    return jsonify({'access_token': new_access_token}), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Logout endpoint.

    Token invalidation is handled client-side (delete token from storage).
    For stateless JWTs we simply return 200 here.

    Returns:
        200: {message: 'Logged out'}
    """
    return jsonify({'message': 'Logged out'}), 200
