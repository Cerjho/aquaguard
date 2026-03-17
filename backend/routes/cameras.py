"""
backend/routes/cameras.py
--------------------------
Camera-zone management blueprint (includes MJPEG proxy stream — P3-10).

Endpoints
---------
GET    /api/v1/cameras                  — list active cameras
POST   /api/v1/cameras                  — register new camera (admin only)
PUT    /api/v1/cameras/<zone_id>        — update camera config (admin only)
DELETE /api/v1/cameras/<zone_id>        — soft-delete camera (admin only)
GET    /api/v1/cameras/<zone_id>/stream — MJPEG proxy stream (jwt required)
"""

import logging
from datetime import datetime

import cv2
from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required

from auth_helpers import role_required
from extensions import db
from models import CameraZone

logger = logging.getLogger(__name__)

cameras_bp = Blueprint('cameras', __name__, url_prefix='/api/v1')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_frames(rtsp_url: str):
    """
    Generator that yields MJPEG-encoded JPEG frames from an RTSP/webcam source.

    P3-10 — MJPEG stream endpoint implementation.

    Args:
        rtsp_url: RTSP URL string or integer webcam index.

    Yields:
        bytes: multipart JPEG frame bytes.
    """
    cap = cv2.VideoCapture(rtsp_url)
    try:
        while True:
            success, frame = cap.read()
            if not success:
                logger.warning("MJPEG stream: failed to read frame from %s", rtsp_url)
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


# ── Routes ────────────────────────────────────────────────────────────────────

@cameras_bp.route('/cameras', methods=['GET'])
@jwt_required()
def list_cameras():
    """
    Return all active camera zones.

    Returns:
        200: {cameras: [CameraZone.to_dict(), ...]}
    """
    cameras = CameraZone.query.filter_by(is_active=True).all()
    return jsonify({'cameras': [c.to_dict() for c in cameras]}), 200


@cameras_bp.route('/cameras', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_camera():
    """
    Register a new camera zone (admin only).

    Request body (JSON):
        zone_id (str), zone_name (str), rtsp_url (str),
        location_description (str, optional),
        frame_rate (int, optional, default 30),
        resolution (str, optional, default '1280x720')

    Returns:
        201: created CameraZone.to_dict()
        400: missing required fields or duplicate zone_id
    """
    data = request.get_json(silent=True) or {}

    required = ['zone_id', 'zone_name', 'rtsp_url']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing required fields: {missing}'}), 400

    if CameraZone.query.filter_by(zone_id=data['zone_id']).first():
        return jsonify({'error': f"zone_id '{data['zone_id']}' already exists"}), 400

    camera = CameraZone(
        zone_id=data['zone_id'],
        zone_name=data['zone_name'],
        rtsp_url=data['rtsp_url'],
        location_description=data.get('location_description'),
        frame_rate=data.get('frame_rate', 30),
        resolution=data.get('resolution', '1280x720'),
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.session.add(camera)
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to create camera: %s", exc)
        return jsonify({'error': 'Database error creating camera'}), 500

    return jsonify(camera.to_dict()), 201


@cameras_bp.route('/cameras/<zone_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_camera(zone_id: str):
    """
    Update an existing camera zone config (admin only).

    Args:
        zone_id: The zone_id URL segment to update.

    Request body (JSON): any subset of CameraZone fields.

    Returns:
        200: updated CameraZone.to_dict()
        404: zone not found
    """
    camera = CameraZone.query.filter_by(zone_id=zone_id).first_or_404()
    data = request.get_json(silent=True) or {}

    updatable = [
        'zone_name', 'rtsp_url', 'location_description',
        'frame_rate', 'resolution', 'is_active',
    ]
    for field in updatable:
        if field in data:
            setattr(camera, field, data[field])

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to update camera %s: %s", zone_id, exc)
        return jsonify({'error': 'Database error updating camera'}), 500

    return jsonify(camera.to_dict()), 200


@cameras_bp.route('/cameras/<zone_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_camera(zone_id: str):
    """
    Soft-delete a camera zone by setting is_active=False (admin only).

    Args:
        zone_id: The zone_id URL segment to deactivate.

    Returns:
        200: {message: 'Camera deactivated', zone_id: zone_id}
        404: zone not found
    """
    camera = CameraZone.query.filter_by(zone_id=zone_id).first_or_404()
    camera.is_active = False

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to deactivate camera %s: %s", zone_id, exc)
        return jsonify({'error': 'Database error deactivating camera'}), 500

    return jsonify({'message': 'Camera deactivated', 'zone_id': zone_id}), 200


@cameras_bp.route('/cameras/<zone_id>/stream', methods=['GET'])
@jwt_required()
def stream_camera(zone_id: str):
    """
    P3-10 — MJPEG proxy stream for a camera zone.

    Streams JPEG frames as multipart/x-mixed-replace from the camera's
    RTSP URL (or webcam index).

    Args:
        zone_id: The camera zone to stream.

    Returns:
        multipart/x-mixed-replace streaming response
        404: camera not found or inactive
    """
    camera = CameraZone.query.filter_by(
        zone_id=zone_id, is_active=True
    ).first_or_404()

    return Response(
        _generate_frames(camera.rtsp_url),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )
