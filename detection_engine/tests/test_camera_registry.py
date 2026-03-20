"""Unit tests for CameraRegistry backend camera loader."""
from detection_engine.camera.registry import CameraRegistry


def test_load_from_backend_creates_captures(monkeypatch):
    created = []

    class FakeCameraCapture:
        def __init__(self, zone_id, rtsp_url, frame_rate):
            created.append((zone_id, rtsp_url, frame_rate))
            self.zone_id = zone_id
            self.rtsp_url = rtsp_url
            self.frame_rate = frame_rate

    monkeypatch.setattr(
        "detection_engine.camera.registry.CameraCapture",
        FakeCameraCapture,
    )

    registry = CameraRegistry()
    registry.load_from_backend(
        [
            {"zone_id": "zone_01", "rtsp_url": "rtsp://cam-1", "frame_rate": 20},
            {"zone_id": "zone_02", "rtsp_url": "rtsp://cam-2"},
        ]
    )

    assert len(registry.cameras) == 2
    assert created[0] == ("zone_01", "rtsp://cam-1", 20)
    assert created[1] == ("zone_02", "rtsp://cam-2", 30)
