"""Unit tests for camera capture thread-safety and stop/read race handling."""
import threading
import time

import numpy as np
import pytest

from detection_engine.camera.capture import CameraCapture


def test_constructor_rejects_non_positive_frame_rate():
    with pytest.raises(ValueError, match="frame_rate must be positive"):
        CameraCapture(zone_id="zone_bad", rtsp_url=0, frame_rate=0)

    with pytest.raises(ValueError, match="frame_rate must be positive"):
        CameraCapture(zone_id="zone_bad", rtsp_url=0, frame_rate=-5)


class _RaceAwareCapture:
    """Fake cv2.VideoCapture that can detect release while read is running."""

    def __init__(self):
        self._opened = True
        self._released = False
        self.release_calls = 0
        self.read_entered = threading.Event()
        self.read_during_release = False
        self._frame = np.zeros((32, 32, 3), dtype=np.uint8)

    def isOpened(self):
        return self._opened and not self._released

    def read(self):
        self.read_entered.set()
        if self._released:
            raise RuntimeError("read called after release")
        # Keep read in progress long enough to let stop() race with it.
        time.sleep(0.05)
        if self._released:
            self.read_during_release = True
            raise RuntimeError("capture released during read")
        return True, self._frame.copy()

    def set(self, *_args, **_kwargs):
        """Mimic cv2.VideoCapture.set for backend-specific capture setup."""
        return True

    def release(self):
        self.release_calls += 1
        self._released = True
        self._opened = False


def test_stop_while_read_in_progress_is_thread_safe(monkeypatch):
    """stop() must not release _cap while capture loop is inside _cap.read()."""
    fake_cap = _RaceAwareCapture()

    # Always return the same fake handle for this test.
    monkeypatch.setattr(
        "detection_engine.camera.capture.cv2.VideoCapture",
        lambda *args, **kwargs: fake_cap,
    )

    cam = CameraCapture(zone_id="zone_test", rtsp_url=0, frame_rate=30)
    cam.start()

    assert fake_cap.read_entered.wait(timeout=1.0), "capture loop did not enter read()"

    stop_thread = threading.Thread(target=cam.stop, daemon=True)
    stop_thread.start()
    stop_thread.join(timeout=2.0)

    assert not stop_thread.is_alive(), "stop() blocked unexpectedly"
    assert cam._thread is not None and not cam._thread.is_alive()
    assert fake_cap.read_during_release is False
    assert fake_cap.release_calls >= 1


def test_read_returns_stable_frame_metadata_for_latest_frame():
    cam = CameraCapture(zone_id="zone_test", rtsp_url=0, frame_rate=30)
    fake_frame = np.ones((32, 32, 3), dtype=np.uint8)
    frame_timestamp = "2026-04-20T03:40:00+00:00"

    with cam._frame_lock:
        cam._latest_frame = fake_frame
        cam._latest_frame_timestamp = frame_timestamp
        cam._latest_frame_sequence = 42

    frame_1, metadata_1 = cam.read()
    frame_2, metadata_2 = cam.read()

    assert frame_1 is fake_frame
    assert frame_2 is fake_frame
    assert metadata_1["timestamp"] == frame_timestamp
    assert metadata_2["timestamp"] == frame_timestamp
    assert metadata_1["frame_sequence"] == 42
    assert metadata_2["frame_sequence"] == 42


def test_sleep_after_success_is_disabled_for_rtsp_streams():
    cam = CameraCapture(
        zone_id="zone_rtsp",
        rtsp_url="rtsp://192.168.1.10:8080/h264_ulaw.sdp",
        frame_rate=12,
    )

    assert cam._sleep_after_success_seconds() == 0.0


def test_sleep_after_success_is_enabled_for_local_camera_index():
    cam = CameraCapture(zone_id="zone_local", rtsp_url=0, frame_rate=12)

    assert cam._sleep_after_success_seconds() == pytest.approx(1 / 12)
