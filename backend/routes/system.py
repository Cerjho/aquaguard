from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app
from utils.response_utils import success_response, error_response
from flask_jwt_extended import jwt_required

from runtime_status import get_runtime_status, update_esp32_heartbeat
from auth_helpers import validate_internal_api_key
from extensions import limiter

system_bp = Blueprint('system', __name__, url_prefix='/api/v1/system')


@system_bp.route('/status', methods=['GET'])
@limiter.limit(
    '120 per minute',
    exempt_when=lambda: current_app.config.get('TESTING', False),
)
@jwt_required()
def system_status():
    return success_response(get_runtime_status())


@system_bp.route('/heartbeat', methods=['POST'])
@limiter.exempt
def heartbeat():
    if not validate_internal_api_key():
        return error_response('Unauthorized', status_code=401)

    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id')
    if not device_id:
        return error_response('device_id is required', status_code=400)

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
    return success_response(None, message='heartbeat accepted')
