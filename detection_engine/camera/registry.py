"""Camera registry — loads camera config and manages CameraCapture lifecycle."""
import json
import logging
from typing import Dict

from detection_engine.camera.capture import CameraCapture

logger = logging.getLogger(__name__)


class CameraRegistry:
    """Manages a collection of CameraCapture instances keyed by zone_id."""

    def __init__(self):
        self.cameras: Dict[str, CameraCapture] = {}

    def load_from_json(self, path: str) -> None:
        """Parse cameras.json and create one CameraCapture per entry.

        Args:
            path: Absolute or relative path to cameras.json.
        """
        with open(path, "r") as fh:
            data = json.load(fh)

        for entry in data.get("cameras", []):
            zone_id = entry["zone_id"]
            rtsp_url = entry["rtsp_url"]
            frame_rate = entry.get("frame_rate", 30)
            self.cameras[zone_id] = CameraCapture(zone_id, rtsp_url, frame_rate)
            logger.info("Registered camera zone: %s → %s", zone_id, rtsp_url)

    def get(self, zone_id: str) -> CameraCapture:
        """Return the CameraCapture for a zone (O(1) dict lookup).

        Raises:
            KeyError: if zone_id is not registered.
        """
        return self.cameras[zone_id]

    def start_all(self) -> None:
        """Start all registered camera capture threads."""
        for zone_id, cam in self.cameras.items():
            logger.info("Starting camera: %s", zone_id)
            cam.start()

    def stop_all(self) -> None:
        """Stop all camera capture threads gracefully."""
        for zone_id, cam in self.cameras.items():
            logger.info("Stopping camera: %s", zone_id)
            cam.stop()
