"""Standardized API response formatting utilities."""

from flask import jsonify


def success_response(data, message="ok", status_code=200):
    """
    Return a standardized success response.  
    Args:
        data: Response payload
        message: Human-readable message
        status_code: HTTP status code 
    Returns:
        Tuple of (Flask response, status code)
    """
    return jsonify({
        "status": "success",
        "message": message,
        "data": data
    }), status_code


def error_response(message, error_code=None, status_code=400):
    """
    Return a standardized error response.    
    Args:
        message: Human-readable error message
        error_code: Machine-readable error code (optional)
        status_code: HTTP status code  
    Returns:
        Tuple of (Flask response, status code)
    """
    response = {
        "status": "error",
        "message": message,
        "data": None
    }
    if error_code:
        response["error_code"] = error_code
    return jsonify(response), status_code
