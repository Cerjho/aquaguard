"""Clips API routes — local drowning event clip management.

Endpoints:
  GET    /api/v1/clips              — List clips (filtered, paginated)
  GET    /api/v1/clips/<clip_id>    — Get clip metadata
  GET    /api/v1/clips/<clip_id>/video — Stream clip MP4 (Range support)
  PATCH  /api/v1/clips/<clip_id>/review — Submit review (confirm/dismiss)
"""
import logging
import os

from flask import Blueprint, request, send_file, abort
from flask_jwt_extended import jwt_required, get_jwt_identity

from utils.response_utils import success_response, error_response
from services.clips_service import (
    list_clips,
    get_clip_metadata,
    get_clip_video_path,
    update_clip_review,
)

clips_bp = Blueprint('clips', __name__, url_prefix='/api/v1')
logger = logging.getLogger(__name__)


def _parse_positive_int(raw_value, default_value):
    try:
        parsed = int(raw_value)
        return parsed if parsed > 0 else default_value
    except (TypeError, ValueError):
        return default_value


@clips_bp.route('/clips', methods=['GET'])
@jwt_required()
def list_clips_route():
    """List clips with optional filters.

    Query params:
      zone_id, status (pending|confirmed|dismissed),
      from, to (ISO-8601), page, limit
    """
    zone_id = request.args.get('zone_id')
    status = request.args.get('status')
    from_dt = request.args.get('from')
    to_dt = request.args.get('to')
    page = _parse_positive_int(request.args.get('page'), 1)
    limit = _parse_positive_int(request.args.get('limit'), 20)

    # Cap limit to prevent abuse
    if limit > 100:
        limit = 100

    result = list_clips(
        zone_id=zone_id,
        status=status,
        from_dt=from_dt,
        to_dt=to_dt,
        page=page,
        limit=limit,
    )
    return success_response(result)


@clips_bp.route('/clips/<clip_id>', methods=['GET'])
@jwt_required()
def get_clip_route(clip_id):
    """Get metadata for a single clip."""
    meta = get_clip_metadata(clip_id)
    if meta is None:
        return error_response('Clip not found', status_code=404)

    # Remove internal fields before returning
    meta.pop('_json_path', None)
    meta.pop('_folder', None)
    return success_response(meta)


@clips_bp.route('/clips/<clip_id>/video', methods=['GET'])
@jwt_required()
def stream_clip_video(clip_id):
    """Stream a clip's MP4 file with Range header support for seeking."""
    video_path = get_clip_video_path(clip_id)
    if video_path is None or not os.path.isfile(video_path):
        abort(404)

    return send_file(
        video_path,
        mimetype='video/mp4',
        conditional=True,  # Enables Range/If-Range support
    )


@clips_bp.route('/clips/<clip_id>/review', methods=['PATCH'])
@jwt_required()
def review_clip_route(clip_id):
    """Submit a review outcome for a clip.

    Body JSON:
      outcome: 'confirmed' | 'dismissed' (required)
      notes: string (optional)
    """
    data = request.get_json(silent=True)
    if not data:
        return error_response('Request body must be JSON', status_code=400)

    outcome = data.get('outcome', '').strip().lower()
    if outcome not in ('confirmed', 'dismissed'):
        return error_response(
            "outcome must be 'confirmed' or 'dismissed'",
            status_code=400,
        )

    reviewer = get_jwt_identity()
    notes = data.get('notes')

    updated = update_clip_review(
        clip_id=clip_id,
        outcome=outcome,
        reviewed_by=reviewer,
        notes=notes,
    )
    if updated is None:
        return error_response('Clip not found or update failed', status_code=404)

    return success_response(updated, message=f'Clip {outcome}')
