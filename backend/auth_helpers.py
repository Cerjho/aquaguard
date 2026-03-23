from functools import wraps
from flask import jsonify, current_app, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def role_required(role):
    """Decorator that checks the 'role' claim in the JWT payload."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get('role') != role:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def validate_internal_api_key() -> bool:
    expected_key = current_app.config.get('AQUAGUARD_API_KEY')
    provided_key = request.headers.get('X-API-Key')
    return bool(expected_key and provided_key and expected_key == provided_key)
