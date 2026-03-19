from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from runtime_status import get_runtime_status

system_bp = Blueprint('system', __name__, url_prefix='/api/v1/system')


@system_bp.route('/status', methods=['GET'])
@jwt_required()
def system_status():
    return jsonify(get_runtime_status()), 200
