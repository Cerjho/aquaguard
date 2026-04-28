import os
import time
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, current_app, Response
from utils.response_utils import success_response, error_response
from flask_jwt_extended import jwt_required
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlalchemy.exc import SQLAlchemyError

from extensions import db, limiter
from models import CameraZone
from auth_helpers import role_required, validate_internal_api_key
from utils.env_utils import is_truthy

cameras_bp = Blueprint('cameras', __name__, url_prefix='/api/v1')


@cameras_bp.route('/internal/cameras', methods=['GET'])
@limiter.exempt
def list_internal_cameras():
    if not validate_internal_api_key():
        return error_response('Unauthorized', status_code=401)

    cameras = CameraZone.query.filter_by(is_active=True).all()
    return success_response({
        'cameras': [
            {
                'zone_id': camera.zone_id,
                'rtsp_url': camera.rtsp_url,
                'frame_rate': camera.frame_rate,
                'zone_name': camera.zone_name,
                'location_description': camera.location_description,
                'resolution': camera.resolution,
                'is_active': camera.is_active,
            }
            for camera in cameras
        ]
    })


@cameras_bp.route('/cameras', methods=['GET'])
@jwt_required()
def list_cameras():
    include_inactive = is_truthy(request.args.get('include_inactive'))
    # Soft-deleted cameras use is_active=None and are always excluded from lists.
    query = CameraZone.query.filter(CameraZone.is_active.isnot(None))
    if not include_inactive:
        query = query.filter_by(is_active=True)
    cameras = query.all()
    return success_response([c.to_dict() for c in cameras])


@cameras_bp.route('/cameras', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_camera():
    data = request.get_json(silent=True) or {}
    required = ['zone_id', 'zone_name', 'rtsp_url']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return error_response(f'Missing fields: {missing}', status_code=400)

    if CameraZone.query.filter_by(zone_id=data['zone_id']).first():
        return error_response('zone_id already exists', status_code=409)

    if 'is_active' in data and not isinstance(data.get('is_active'), bool):
        return error_response('is_active must be a boolean', status_code=400)

    camera = CameraZone(
        zone_id              = data['zone_id'],
        zone_name            = data['zone_name'],
        rtsp_url             = data['rtsp_url'],
        location_description = data.get('location_description'),
        frame_rate           = data.get('frame_rate', 30),
        resolution           = data.get('resolution', '1280x720'),
        is_active            = data.get('is_active', True),
    )
    db.session.add(camera)
    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error creating camera: {exc}')
        return error_response('Database error', status_code=500)

    return success_response(camera.to_dict(), status_code=201)


@cameras_bp.route('/cameras/<zone_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_camera(zone_id):
    camera = CameraZone.query.filter(
        CameraZone.zone_id == zone_id,
        CameraZone.is_active.isnot(None),
    ).first_or_404()
    data = request.get_json(silent=True) or {}

    if 'is_active' in data and not isinstance(data.get('is_active'), bool):
        return error_response('is_active must be a boolean', status_code=400)

    for field in [
        'zone_name', 'rtsp_url', 'location_description', 'frame_rate', 'resolution', 'is_active'
    ]:
        if field in data:
            setattr(camera, field, data[field])

    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error updating camera: {exc}')
        return error_response('Database error', status_code=500)

    return success_response(camera.to_dict())


@cameras_bp.route('/cameras/<zone_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_camera(zone_id):
    camera = CameraZone.query.filter_by(zone_id=zone_id).first()
    if camera is None:
        return error_response(f'Camera {zone_id} not found', status_code=404)

    if camera.is_active is None:
        return success_response(
            {'camera': camera.to_dict()},
            message=f'Camera {zone_id} already soft deleted',
        )

    camera.is_active = None
    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error deleting camera: {exc}')
        return error_response('Database error', status_code=500)

    return success_response(
        {'camera': camera.to_dict()},
        message=f'Camera {zone_id} soft deleted',
    )


# ── P3-10: MJPEG stream ──────────────────────────────────────────────────────

LIVE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'snapshots', 'live'
)


def _stream_token_serializer():
    return URLSafeTimedSerializer(
        secret_key=current_app.config['SECRET_KEY'],
        salt='camera-stream-token-v1',
    )


def _stream_token_ttl_seconds():
    raw = os.getenv('STREAM_TOKEN_TTL_SECONDS', '30')
    try:
        return max(int(raw), 1)
    except (TypeError, ValueError):
        return 30


def _generate_stream_token(zone_id):
    payload = {'zone_id': zone_id}
    return _stream_token_serializer().dumps(payload)


def _validate_stream_token(token, zone_id):
    try:
        payload = _stream_token_serializer().loads(
            token,
            max_age=_stream_token_ttl_seconds(),
        )
    except SignatureExpired:
        return False, 'Stream token expired'
    except BadSignature:
        return False, 'Invalid stream token'

    if payload.get('zone_id') != zone_id:
        return False, 'Stream token zone mismatch'
    return True, None


@cameras_bp.route('/cameras/<zone_id>/stream-token', methods=['GET', 'POST'])
@jwt_required()
def create_stream_token(zone_id):
    CameraZone.query.filter_by(zone_id=zone_id, is_active=True).first_or_404()
    ttl_seconds = _stream_token_ttl_seconds()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
    return success_response({
        'zone_id': zone_id,
        'stream_token': _generate_stream_token(zone_id),
        'ttl_seconds': ttl_seconds,
        'expires_at': expires_at,
        'expires_in_seconds': ttl_seconds,
    })


@cameras_bp.route('/cameras/<zone_id>/stream', methods=['GET'])
def stream_camera(zone_id):
    token = request.args.get('token', '').strip()
    if not token:
        return error_response('stream token is required', status_code=401)

    is_valid, reason = _validate_stream_token(token, zone_id)
    if not is_valid:
        return error_response(reason, status_code=401)

    CameraZone.query.filter_by(
        zone_id=zone_id, is_active=True
    ).first_or_404()

    frame_path = os.path.join(LIVE_DIR, f'{zone_id}_latest.jpg')

    def generate():
        cached_frame = None
        cached_mtime = None
        while True:
            if os.path.exists(frame_path):
                try:
                    frame_mtime = os.path.getmtime(frame_path)
                    if cached_frame is None or frame_mtime != cached_mtime:
                        with open(frame_path, 'rb') as f:
                            cached_frame = f.read()
                        cached_mtime = frame_mtime
                    frame_bytes = cached_frame
                    yield (
                        b'--frame\r\n'
                        b'Content-Type: image/jpeg\r\n\r\n'
                        + frame_bytes
                        + b'\r\n'
                    )
                except OSError:
                    pass
            time.sleep(0.033)

    return Response(
        generate(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


# ── Camera Health API ─────────────────────────────────────────────────────────

@cameras_bp.route('/cameras/<zone_id>/health', methods=['GET'])
@jwt_required()
def get_camera_health(zone_id):
    """Return real-time health metrics for a camera.

    Health data is read from the detection engine's status file.
    """
    CameraZone.query.filter_by(zone_id=zone_id, is_active=True).first_or_404()

    status_path = os.path.join(LIVE_DIR, f'{zone_id}_status.json')
    if not os.path.exists(status_path):
        return success_response({
            'zone_id': zone_id,
            'status': 'unknown',
            'error': 'No health data available - detection engine may not be running',
        })

    try:
        with open(status_path, 'r', encoding='utf-8') as f:
            import json
            health_data = json.load(f)
        return success_response(health_data)
    except (OSError, json.JSONDecodeError) as exc:
        current_app.logger.warning(f'Failed to read health data for {zone_id}: {exc}')
        return success_response({
            'zone_id': zone_id,
            'status': 'error',
            'error': 'Failed to read health data',
        })


@cameras_bp.route('/cameras/health', methods=['GET'])
@jwt_required()
def get_all_cameras_health():
    """Return health metrics for all active cameras."""
    cameras = CameraZone.query.filter_by(is_active=True).all()
    health_results = []

    for camera in cameras:
        status_path = os.path.join(LIVE_DIR, f'{camera.zone_id}_status.json')
        if os.path.exists(status_path):
            try:
                with open(status_path, 'r', encoding='utf-8') as f:
                    import json
                    health_data = json.load(f)
                health_results.append(health_data)
            except (OSError, json.JSONDecodeError):
                health_results.append({
                    'zone_id': camera.zone_id,
                    'status': 'error',
                    'error': 'Failed to read health data',
                })
        else:
            health_results.append({
                'zone_id': camera.zone_id,
                'status': 'unknown',
                'error': 'No health data available',
            })

    return success_response({'cameras': health_results})


@cameras_bp.route('/internal/cameras/<zone_id>/health', methods=['GET'])
@limiter.exempt
def get_internal_camera_health(zone_id):
    """Internal API for detection engine to report health (no JWT required)."""
    if not validate_internal_api_key():
        return error_response('Unauthorized', status_code=401)

    status_path = os.path.join(LIVE_DIR, f'{zone_id}_status.json')
    if not os.path.exists(status_path):
        return success_response({
            'zone_id': zone_id,
            'status': 'unknown',
        })

    try:
        with open(status_path, 'r', encoding='utf-8') as f:
            import json
            return success_response(json.load(f))
    except (OSError, json.JSONDecodeError):
        return success_response({
            'zone_id': zone_id,
            'status': 'error',
        })
