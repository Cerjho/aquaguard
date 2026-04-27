"""Check camera zones in database."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from models import CameraZone


def list_cameras():
    app = create_app()
    with app.app_context():
        cameras = CameraZone.query.all()
        print(f"\nFound {len(cameras)} camera(s) in database:\n")
        for cam in cameras:
            status = "ACTIVE" if cam.is_active else "DISABLED"
            print(
                f"  [{status}] zone_id='{cam.zone_id}' "
                f"name='{cam.zone_name}' rtsp='{cam.rtsp_url}'"
            )
        print()


if __name__ == '__main__':
    list_cameras()
