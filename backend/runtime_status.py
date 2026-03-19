import os
from datetime import datetime, timezone

from models import CameraZone


LIVE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'snapshots',
    'live',
)


def _stale_threshold_seconds():
    raw_value = os.getenv('LIVE_SNAPSHOT_STALE_THRESHOLD_SECONDS', '10')
    try:
        return max(float(raw_value), 0.0)
    except (TypeError, ValueError):
        return 10.0


def _snapshot_meta(zone_id):
    file_path = os.path.join(LIVE_DIR, f'{zone_id}_latest.jpg')
    if not os.path.exists(file_path):
        return {
            'status': 'offline',
            'snapshot_age_seconds': None,
            'last_snapshot_at': None,
        }

    mtime = os.path.getmtime(file_path)
    now = datetime.now(timezone.utc).timestamp()
    age_seconds = max(now - mtime, 0.0)
    threshold = _stale_threshold_seconds()
    status = 'online' if age_seconds <= threshold else 'offline'
    last_snapshot_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()

    return {
        'status': status,
        'snapshot_age_seconds': round(age_seconds, 3),
        'last_snapshot_at': last_snapshot_at,
    }


def _zone_ids_from_live_dir():
    if not os.path.isdir(LIVE_DIR):
        return []

    zone_ids = []
    for filename in os.listdir(LIVE_DIR):
        if filename.endswith('_latest.jpg'):
            zone_ids.append(filename[:-11])  # remove "_latest.jpg"
    return zone_ids


def get_runtime_status():
    threshold = _stale_threshold_seconds()
    camera_map = {}

    try:
        cameras = CameraZone.query.filter_by(is_active=True).all()
    except Exception:
        cameras = []

    for camera in cameras:
        meta = _snapshot_meta(camera.zone_id)
        camera_map[camera.zone_id] = {
            'zone_id': camera.zone_id,
            'zone_name': camera.zone_name,
            'status': meta['status'],
            'snapshot_age_seconds': meta['snapshot_age_seconds'],
            'last_snapshot_at': meta['last_snapshot_at'],
        }

    for zone_id in _zone_ids_from_live_dir():
        if zone_id in camera_map:
            continue
        meta = _snapshot_meta(zone_id)
        camera_map[zone_id] = {
            'zone_id': zone_id,
            'zone_name': zone_id,
            'status': meta['status'],
            'snapshot_age_seconds': meta['snapshot_age_seconds'],
            'last_snapshot_at': meta['last_snapshot_at'],
        }

    camera_status = list(camera_map.values())
    any_online = any(c['status'] == 'online' for c in camera_status)

    return {
        'detection_engine': {
            'component': 'detection_engine',
            'status': 'online' if any_online else 'offline',
            'message': 'Live snapshots are fresh' if any_online else 'No fresh live snapshots',
            'stale_threshold_seconds': threshold,
        },
        'camera_status': camera_status,
    }
