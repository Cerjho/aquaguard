"""Camera registry — loads camera config and manages CameraCapture lifecycle."""
import json
import logging
from typing import Dict, List, Optional

from detection_engine.camera.capture import CameraCapture, mask_rtsp_credentials, validate_rtsp_url
from detection_engine.camera.health import CameraHealth

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
            self._register_camera(entry)

    def load_from_backend(self, cameras: List[dict]) -> None:
        """Load cameras from backend payload list.

        Args:
            cameras: List of camera dictionaries.
        """
        for entry in cameras:
            self._register_camera(entry, source="backend")

    def _register_camera(self, entry: dict, source: str = "config") -> bool:
        """Register a single camera from config entry.

        Returns:
            True if registered successfully, False if validation failed.
        """
        zone_id = entry.get("zone_id")
        rtsp_url = entry.get("rtsp_url")
        frame_rate = entry.get("frame_rate", 30)

        if not zone_id:
            logger.error("Camera entry missing zone_id: %s", entry)
            return False

        is_valid, error = validate_rtsp_url(rtsp_url)
        if not is_valid:
            logger.error(
                "Invalid RTSP URL for zone %s: %s (source: %s)",
                zone_id,
                error,
                source,
            )
            return False

        try:
            self.cameras[zone_id] = CameraCapture(zone_id, rtsp_url, frame_rate)
            logger.info(
                "Registered %s camera zone: %s → %s",
                source,
                zone_id,
                mask_rtsp_credentials(rtsp_url),
            )
            return True
        except ValueError as exc:
            logger.error("Failed to create camera %s: %s", zone_id, exc)
            return False

    def get(self, zone_id: str) -> CameraCapture:
        """Return the CameraCapture for a zone (O(1) dict lookup).

        Raises:
            KeyError: if zone_id is not registered.
        """
        return self.cameras[zone_id]

    def get_health(self, zone_id: str) -> Optional[CameraHealth]:
        """Return health metrics for a specific camera.

        Returns:
            CameraHealth or None if zone not found.
        """
        camera = self.cameras.get(zone_id)
        if camera:
            return camera.health
        return None

    def get_all_health(self) -> Dict[str, CameraHealth]:
        """Return health metrics for all cameras."""
        return {zone_id: cam.health for zone_id, cam in self.cameras.items()}

    def test_camera(self, zone_id: str, timeout: int = 10) -> dict:
        """Test connection to a specific camera.

        Returns:
            Test result dict with success, error, capabilities.
        """
        camera = self.cameras.get(zone_id)
        if not camera:
            return {
                'success': False,
                'error': f'Camera zone {zone_id} not found',
                'capabilities': {},
            }

        success, error, capabilities = camera.test_connection(timeout)
        return {
            'success': success,
            'error': error,
            'capabilities': capabilities,
        }

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
