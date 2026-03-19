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


_ESP32_HEARTBEAT = {
    'device_id': None,
    'status': 'offline',
    'uptime_ms': None,
    'last_heartbeat_at': None,
}


def update_esp32_heartbeat(device_id, status='online', uptime_ms=None, timestamp=None):
    heartbeat_time = timestamp or datetime.now(timezone.utc)
    if isinstance(heartbeat_time, str):
        try:
            heartbeat_time = datetime.fromisoformat(heartbeat_time)
        except ValueError:
            heartbeat_time = datetime.now(timezone.utc)
    if heartbeat_time.tzinfo is None:
        heartbeat_time = heartbeat_time.replace(tzinfo=timezone.utc)

    _ESP32_HEARTBEAT.update({
        'device_id': device_id,
        'status': status or 'online',
        'uptime_ms': uptime_ms,
        'last_heartbeat_at': heartbeat_time.isoformat(),
    })


def get_esp32_status():
    threshold_raw = os.getenv('ESP32_HEARTBEAT_STALE_THRESHOLD_SECONDS', '90')
    try:
        threshold = max(float(threshold_raw), 0.0)
    except (TypeError, ValueError):
        threshold = 90.0

    last = _ESP32_HEARTBEAT.get('last_heartbeat_at')
    if not last:
        return {
            'device_id': _ESP32_HEARTBEAT.get('device_id'),
            'status': 'offline',
            'uptime_ms': _ESP32_HEARTBEAT.get('uptime_ms'),
            'last_heartbeat_at': None,
            'heartbeat_age_seconds': None,
            'stale_threshold_seconds': threshold,
        }

    try:
        last_dt = datetime.fromisoformat(last)
    except ValueError:
        last_dt = datetime.now(timezone.utc)
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)

    age_seconds = max(datetime.now(timezone.utc).timestamp() - last_dt.timestamp(), 0.0)
    resolved_status = 'online' if age_seconds <= threshold else 'offline'

    return {
        'device_id': _ESP32_HEARTBEAT.get('device_id'),
        'status': resolved_status,
        'uptime_ms': _ESP32_HEARTBEAT.get('uptime_ms'),
        'last_heartbeat_at': last_dt.isoformat(),
        'heartbeat_age_seconds': round(age_seconds, 3),
        'stale_threshold_seconds': threshold,
    }


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
        'esp32': get_esp32_status(),
        'camera_status': camera_status,
    }
