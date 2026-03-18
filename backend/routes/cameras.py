import cv2
from flask import Blueprint, request, jsonify, current_app, Response
from flask_jwt_extended import jwt_required, decode_token

from extensions import db
from models import CameraZone
from auth_helpers import role_required

cameras_bp = Blueprint('cameras', __name__, url_prefix='/api/v1')


@cameras_bp.route('/cameras', methods=['GET'])
@jwt_required()
def list_cameras():
    cameras = CameraZone.query.filter_by(is_active=True).all()
    return jsonify([c.to_dict() for c in cameras]), 200


@cameras_bp.route('/cameras', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_camera():
    data = request.get_json(silent=True) or {}
    required = ['zone_id', 'zone_name', 'rtsp_url']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing fields: {missing}'}), 400

    if CameraZone.query.filter_by(zone_id=data['zone_id']).first():
        return jsonify({'error': 'zone_id already exists'}), 409

    camera = CameraZone(
        zone_id              = data['zone_id'],
        zone_name            = data['zone_name'],
        rtsp_url             = data['rtsp_url'],
        location_description = data.get('location_description'),
        frame_rate           = data.get('frame_rate', 30),
        resolution           = data.get('resolution', '1280x720'),
    )
    db.session.add(camera)
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error creating camera: {exc}')
        return jsonify({'error': 'Database error'}), 500

    return jsonify(camera.to_dict()), 201


@cameras_bp.route('/cameras/<zone_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_camera(zone_id):
    camera = CameraZone.query.filter_by(zone_id=zone_id, is_active=True).first_or_404()
    data = request.get_json(silent=True) or {}

    for field in ['zone_name', 'rtsp_url', 'location_description', 'frame_rate', 'resolution']:
        if field in data:
            setattr(camera, field, data[field])

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error updating camera: {exc}')
        return jsonify({'error': 'Database error'}), 500

    return jsonify(camera.to_dict()), 200


@cameras_bp.route('/cameras/<zone_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_camera(zone_id):
    camera = CameraZone.query.filter_by(zone_id=zone_id, is_active=True).first_or_404()
    camera.is_active = False
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.error(f'DB error deleting camera: {exc}')
        return jsonify({'error': 'Database error'}), 500

    return jsonify({'message': f'Camera {zone_id} deactivated'}), 200


# ── P3-10: MJPEG stream ──────────────────────────────────────────────────────

def _generate_frames(rtsp_url):
    cap = cv2.VideoCapture(rtsp_url)
    try:
        while True:
            success, frame = cap.read()
            if not success:
                break
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                continue
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n'
                + buffer.tobytes()
                + b'\r\n'
            )
    finally:
        cap.release()


@cameras_bp.route('/cameras/<zone_id>/stream', methods=['GET'])
def stream_camera(zone_id):
    token = request.args.get('token')
    if not token:
        return jsonify({'error': 'Missing token'}), 401
    try:
        decode_token(token)
    except Exception:
        return jsonify({'error': 'Invalid token'}), 401

    camera = CameraZone.query.filter_by(zone_id=zone_id, is_active=True).first_or_404()
    rtsp_url = camera.rtsp_url
    # Allow integer source (webcam index) stored as string
    try:
        rtsp_url = int(rtsp_url)
    except (ValueError, TypeError):
        pass
    return Response(
        _generate_frames(rtsp_url),
        mimetype='multipart/x-mixed-replace; boundary=frame',
    )
