"""
backend/seed.py
---------------
Database seeding script — creates default users and a sample camera zone.

Run once after `flask db upgrade`:
    cd backend
    conda activate aquaguard_env
    python seed.py

Safe to re-run — uses check-before-insert to avoid duplicate rows.

CRITICAL (R6-I): bcrypt.generate_password_hash().decode('utf-8') — always decode
"""

import json
import logging
import os
import sys

# Make sure Python finds our backend modules when run as a script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def seed():
    from app import create_app
    from extensions import bcrypt, db
    from models import CameraZone, User

    app = create_app()

    with app.app_context():
        # ── Create tables if they don't exist (idempotent) ────────────────────
        db.create_all()

        # ── Default users ─────────────────────────────────────────────────────
        _seed_user(db, bcrypt, username='admin', password='aquaguard2026', role='admin')
        _seed_user(
            db, bcrypt,
            username='lifeguard',
            password='lifeguard123',
            role='lifeguard'
        )

        # ── Default camera zone from config/cameras.json ──────────────────────
        cameras_json_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'config',
            'cameras.json',
        )
        if os.path.exists(cameras_json_path):
            _seed_cameras(db, cameras_json_path)
        else:
            logger.warning("config/cameras.json not found — skipping camera seed")

        logger.info("Seed complete.")


def _seed_user(db, bcrypt, username: str, password: str, role: str):
    """Insert a user if it doesn't already exist."""
    from models import User

    existing = User.query.filter_by(username=username).first()
    if existing:
        logger.info("User '%s' already exists — skipping", username)
        return

    # R6-I: always decode the bytes hash to a UTF-8 string
    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(
        username=username,
        password_hash=hashed,
        role=role,
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    logger.info("Created user '%s' with role '%s'", username, role)


def _seed_cameras(db, cameras_json_path: str):
    """Insert camera zones from cameras.json if they don't already exist."""
    from datetime import datetime

    from models import CameraZone

    with open(cameras_json_path, 'r') as fh:
        data = json.load(fh)

    cameras = data.get('cameras', [])
    if not cameras:
        logger.warning("cameras.json has no entries — skipping camera seed")
        return

    # Only seed the first camera entry as per task spec
    first = cameras[0]
    zone_id = first.get('zone_id')
    if not zone_id:
        logger.warning("First camera entry has no zone_id — skipping")
        return

    existing = CameraZone.query.filter_by(zone_id=zone_id).first()
    if existing:
        logger.info("CameraZone '%s' already exists — skipping", zone_id)
        return

    zone = CameraZone(
        zone_id=zone_id,
        zone_name=first.get('zone_name', zone_id),
        rtsp_url=str(first.get('rtsp_url', '')),
        location_description=first.get('location_description'),
        frame_rate=int(first.get('frame_rate', 30)),
        resolution=str(first.get('resolution', '1280x720')),
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.session.add(zone)
    db.session.commit()
    logger.info("Created CameraZone '%s' (%s)", zone_id, zone.zone_name)


if __name__ == '__main__':
    seed()
