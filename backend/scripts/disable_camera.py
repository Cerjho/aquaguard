"""Utility script to disable a camera zone by zone_id.

Usage:
    cd backend
    python disable_camera.py 2
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from models import CameraZone


def disable_camera(zone_id: str) -> bool:
    """Disable a camera zone by zone_id. Returns True if found and disabled."""
    app = create_app()
    with app.app_context():
        camera = CameraZone.query.filter_by(zone_id=zone_id).first()
        if camera:
            camera.is_active = False
            db.session.commit()
            print(f"Camera '{zone_id}' disabled successfully.")
            return True
        else:
            print(f"Camera '{zone_id}' not found in database.")
            return False


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python disable_camera.py <zone_id>")
        print("Example: python disable_camera.py 2")
        sys.exit(1)

    zone_id = sys.argv[1]
    success = disable_camera(zone_id)
    sys.exit(0 if success else 1)
