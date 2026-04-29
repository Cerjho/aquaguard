"""
Seed script — creates default users and a camera zone.
Run once after `flask db upgrade`:
    cd backend && conda activate aquaguard_env && python seed.py
"""
import json
import logging
import os
import sys

# Allow running from project root, backend/, or backend/scripts/
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_SCRIPT_DIR)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from app import create_app
from extensions import db, bcrypt
from models import User, CameraZone


logger = logging.getLogger(__name__)


def seed():
    app = create_app()
    with app.app_context():
        db.create_all()

        # ── Default users ───────────────────────────────────────────────────
        admin_username = os.getenv('SEED_ADMIN_USERNAME', 'admin')
        admin_password = os.getenv('SEED_ADMIN_PASSWORD')
        admin_role = os.getenv('SEED_ADMIN_ROLE', 'admin')
        guard_username = os.getenv('SEED_GUARD_USERNAME', 'lifeguard')
        guard_password = os.getenv('SEED_GUARD_PASSWORD')
        guard_role = os.getenv('SEED_GUARD_ROLE', 'lifeguard')

        if not admin_password:
            raise ValueError('SEED_ADMIN_PASSWORD environment variable is required')
        if not guard_password:
            raise ValueError('SEED_GUARD_PASSWORD environment variable is required')

        users = [
            {'username': admin_username, 'password': admin_password, 'role': admin_role},
            {'username': guard_username, 'password': guard_password, 'role': guard_role},
        ]
        for u in users:
            if not User.query.filter_by(username=u['username']).first():
                pw_hash = bcrypt.generate_password_hash(u['password']).decode('utf-8')
                user = User(username=u['username'], password_hash=pw_hash, role=u['role'])
                db.session.add(user)
                logger.info("Created user: %s (%s)", u['username'], u['role'])
            else:
                logger.info("User already exists: %s", u['username'])

        # ── Default camera zone from cameras.json ───────────────────────────
        cameras_path = os.path.join(
            os.path.dirname(_BACKEND_DIR),
            'config', 'cameras.json'
        )
        if os.path.exists(cameras_path):
            with open(cameras_path) as f:
                cameras_data = json.load(f)
            first_cam = cameras_data.get('cameras', [{}])[0]
            zone_id = first_cam.get('zone_id')
            if zone_id and not CameraZone.query.filter_by(zone_id=zone_id).first():
                zone = CameraZone(
                    zone_id              = zone_id,
                    zone_name            = first_cam.get('zone_name', zone_id),
                    rtsp_url             = str(first_cam.get('rtsp_url', '')),
                    location_description = first_cam.get('location_description'),
                    frame_rate           = first_cam.get('frame_rate', 30),
                    resolution           = first_cam.get('resolution', '1280x720'),
                )
                db.session.add(zone)
                logger.info("Created camera zone: %s", zone_id)
            else:
                logger.info("Camera zone already exists or no zone_id: %s", zone_id)

        db.session.commit()
        logger.info("Seed complete.")


if __name__ == '__main__':
    seed()
