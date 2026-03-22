from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required

from runtime_status import get_runtime_status, update_esp32_heartbeat

system_bp = Blueprint('system', __name__, url_prefix='/api/v1/system')


def _validate_internal_api_key():
    expected_key = current_app.config.get('AQUAGUARD_API_KEY')
    provided_key = request.headers.get('X-API-Key')
    return bool(expected_key and provided_key and expected_key == provided_key)


@system_bp.route('/status', methods=['GET'])
@jwt_required()
def system_status():
    return jsonify(get_runtime_status()), 200


@system_bp.route('/heartbeat', methods=['POST'])
def heartbeat():
    if not _validate_internal_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id')
    if not device_id:
        return jsonify({'error': 'device_id is required'}), 400

    status = data.get('status', 'online')
    uptime_ms = data.get('uptime_ms')
    ts_raw = data.get('timestamp')
    timestamp = None
    if ts_raw:
        try:
            timestamp = datetime.fromisoformat(ts_raw)
        except ValueError:
            timestamp = datetime.now(timezone.utc)

    update_esp32_heartbeat(
        device_id=device_id,
        status=status,
        uptime_ms=uptime_ms,
        timestamp=timestamp,
    )
    return jsonify({'message': 'heartbeat accepted'}), 200
