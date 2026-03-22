from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from runtime_status import get_runtime_status, update_esp32_heartbeat
from auth_helpers import validate_internal_api_key
from utils.date_utils import parse_iso_datetime

system_bp = Blueprint('system', __name__, url_prefix='/api/v1/system')


@system_bp.route('/status', methods=['GET'])
@jwt_required()
def system_status():
    return jsonify(get_runtime_status()), 200


@system_bp.route('/heartbeat', methods=['POST'])
def heartbeat():
    if not validate_internal_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id')
    if not device_id:
        return jsonify({'error': 'device_id is required'}), 400

    status = data.get('status', 'online')
    uptime_ms = data.get('uptime_ms')
    ts_raw = data.get('timestamp')
    timestamp = parse_iso_datetime(ts_raw) if ts_raw else None

    update_esp32_heartbeat(
        device_id=device_id,
        status=status,
        uptime_ms=uptime_ms,
        timestamp=timestamp,
    )
    return jsonify({'message': 'heartbeat accepted'}), 200
