"""
backend/auth_helpers.py
-----------------------
JWT utility decorators for role-based access control.

Usage
-----
    from auth_helpers import role_required

    @alerts_bp.route('/api/v1/alerts', methods=['GET'])
    @jwt_required()
    @role_required('admin')
    def list_alerts():
        ...
"""

from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def role_required(role: str):
    """
    Decorator that verifies the JWT is present AND that the `role`
    claim embedded in the token matches the required role.

    Must be used after @jwt_required() — but also works standalone
    because it calls verify_jwt_in_request() internally.

    Args:
        role: Required role string, e.g. 'admin' or 'lifeguard'.

    Returns:
        403 JSON response if the role claim does not match.
    """
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
