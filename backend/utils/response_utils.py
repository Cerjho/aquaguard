"""Standardized API response formatting utilities.

All API endpoints should use these helpers to ensure consistent
response structure: {status, message, data} for success,
{status, error, message, data} for errors.
"""

from flask import jsonify


def success_response(data, message="ok", status_code=200):
    """Return a standardized success response.

    Args:
        data: Response payload (dict, list, or scalar)
        message: Human-readable message
        status_code: HTTP status code

    Returns:
        Tuple of (Flask response, status code)
    """
    return jsonify({
        "status": "success",
        "message": message,
        "data": data,
    }), status_code


def error_response(message, error_code=None, status_code=400):
    """Return a standardized error response.

    Preserves the 'error' key for backward compatibility with
    frontend code that reads response.data.error.

    Args:
        message: Human-readable error message
        error_code: Machine-readable error code (optional)
        status_code: HTTP status code

    Returns:
        Tuple of (Flask response, status code)
    """
    response = {
        "status": "error",
        "error": message,
        "message": message,
        "data": None,
    }
    if error_code:
        response["error_code"] = error_code
    return jsonify(response), status_code
