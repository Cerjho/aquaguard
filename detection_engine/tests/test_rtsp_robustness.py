"""Unit tests for RTSP robustness features in camera capture."""
import threading
import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from config.settings import RTSP_TRANSPORT
from detection_engine.camera.capture import (
    CameraCapture,
    mask_rtsp_credentials,
    validate_rtsp_url,
)
from detection_engine.camera.health import CameraHealth, HealthTracker


class TestRtspUrlValidation:
    """Tests for RTSP URL validation."""

    def test_valid_rtsp_url(self):
        is_valid, error = validate_rtsp_url("rtsp://192.168.1.100:554/stream1")
        assert is_valid is True
        assert error == ""

    def test_valid_rtsp_url_with_credentials(self):
        is_valid, error = validate_rtsp_url("rtsp://admin:password@192.168.1.100:554/stream1")
        assert is_valid is True
        assert error == ""

    def test_valid_http_url(self):
        is_valid, error = validate_rtsp_url("http://192.168.1.100:8080/video")
        assert is_valid is True
        assert error == ""

    def test_valid_webcam_index_int(self):
        is_valid, error = validate_rtsp_url(0)
        assert is_valid is True
        assert error == ""

    def test_valid_webcam_index_str(self):
        is_valid, error = validate_rtsp_url("0")
        assert is_valid is True
        assert error == ""

    def test_invalid_scheme(self):
        is_valid, error = validate_rtsp_url("ftp://192.168.1.100/stream")
        assert is_valid is False
        assert "Invalid URL scheme" in error

    def test_none_url(self):
        is_valid, error = validate_rtsp_url(None)
        assert is_valid is False
        assert "None" in error

    def test_missing_hostname(self):
        is_valid, error = validate_rtsp_url("rtsp:///stream")
        assert is_valid is False
        assert "hostname" in error.lower()


class TestCredentialMasking:
    """Tests for credential masking in URLs."""

    def test_mask_credentials_in_rtsp_url(self):
        masked = mask_rtsp_credentials("rtsp://admin:secret123@192.168.1.100:554/stream")
        assert "secret123" not in masked
        assert "admin" in masked
        assert "****" in masked
        assert "192.168.1.100" in masked

    def test_mask_no_credentials(self):
        url = "rtsp://192.168.1.100:554/stream"
        masked = mask_rtsp_credentials(url)
        assert masked == url

    def test_mask_numeric_input(self):
        masked = mask_rtsp_credentials(0)
        assert masked == "0"


class TestHealthTracker:
    """Tests for camera health tracking."""

    def test_initial_state(self):
        tracker = HealthTracker("zone_test", fps_target=30.0)
        health = tracker.health
        assert health.zone_id == "zone_test"
        assert health.status == "offline"
        assert health.fps_actual == 0.0
        assert health.fps_target == 30.0

    def test_start_sets_connecting(self):
        tracker = HealthTracker("zone_test")
        tracker.start()
        assert tracker.health.status == "connecting"

    def test_connected_sets_online(self):
        tracker = HealthTracker("zone_test")
        tracker.start()
        tracker.connected()
        assert tracker.health.status == "online"

    def test_disconnected_sets_offline(self):
        tracker = HealthTracker("zone_test")
        tracker.connected()
        tracker.disconnected("test error")
        health = tracker.health
        assert health.status == "offline"
        assert health.error_message == "test error"

    def test_reconnecting_increments_count(self):
        tracker = HealthTracker("zone_test")
        tracker.reconnecting()
        tracker.reconnecting()
        assert tracker.health.reconnect_count == 2

    def test_record_frame_updates_count(self):
        tracker = HealthTracker("zone_test")
        tracker.connected()
        tracker.record_frame(time.time(), corrupted=False)
        tracker.record_frame(time.time(), corrupted=False)
        assert tracker.health.total_frames == 2
        assert tracker.health.corrupted_frames == 0

    def test_record_corrupted_frame(self):
        tracker = HealthTracker("zone_test")
        tracker.connected()
        tracker.record_frame(time.time(), corrupted=True)
        tracker.record_frame(time.time(), corrupted=False)
        assert tracker.health.total_frames == 2
        assert tracker.health.corrupted_frames == 1
        assert tracker.health.corruption_rate == 0.5

    def test_fps_calculation(self):
        tracker = HealthTracker("zone_test", fps_target=30.0)
        tracker.connected()

        base_time = time.time()
        for i in range(31):
            tracker.record_frame(base_time + i * 0.033, corrupted=False)

        assert tracker.health.fps_actual > 25.0

    def test_to_dict(self):
        tracker = HealthTracker("zone_test")
        tracker.connected()
        data = tracker.health.to_dict()
        assert data["zone_id"] == "zone_test"
        assert data["status"] == "online"
        assert "fps_actual" in data
        assert "corruption_rate" in data


class TestCameraCapture:
    """Tests for CameraCapture with RTSP features."""

    def test_constructor_validates_url(self):
        with pytest.raises(ValueError, match="Invalid RTSP URL"):
            CameraCapture("zone_test", "ftp://invalid", frame_rate=30)

    def test_constructor_rejects_negative_frame_rate(self):
        with pytest.raises(ValueError, match="frame_rate must be positive"):
            CameraCapture("zone_test", 0, frame_rate=-1)

    def test_constructor_accepts_webcam_index(self):
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        assert cap.zone_id == "zone_test"
        assert cap.rtsp_url == 0

    def test_constructor_accepts_rtsp_url(self):
        cap = CameraCapture("zone_test", "rtsp://192.168.1.100:554/stream", frame_rate=30)
        assert cap.zone_id == "zone_test"

    def test_health_property_returns_health(self):
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        health = cap.health
        assert isinstance(health, CameraHealth)
        assert health.zone_id == "zone_test"

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_test_connection_success(self, mock_cv):
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_cap.get.return_value = 30.0
        mock_cv.return_value = mock_cap

        cap = CameraCapture("zone_test", "rtsp://test", frame_rate=30)
        success, error, capabilities = cap.test_connection(timeout_seconds=5)

        assert success is True
        assert error == ""
        assert capabilities["connected"] is True
        assert capabilities["width"] == 30  # mocked

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_test_connection_failure(self, mock_cv):
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = False
        mock_cv.return_value = mock_cap

        cap = CameraCapture("zone_test", "rtsp://test", frame_rate=30)
        success, error, capabilities = cap.test_connection(timeout_seconds=5)

        assert success is False
        assert "Failed to open" in error
        assert capabilities["connected"] is False


class TestFrameValidation:
    """Tests for enhanced frame validation."""

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_validate_frame_rejects_none(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        is_valid, reason = cap._validate_frame(None)
        assert is_valid is False
        assert reason == "frame_is_none"

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_validate_frame_rejects_empty(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        frame = np.array([])
        is_valid, reason = cap._validate_frame(frame)
        assert is_valid is False
        assert reason == "empty_frame"

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_validate_frame_rejects_black_frame(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        is_valid, reason = cap._validate_frame(frame)
        assert is_valid is False
        assert reason == "all_black_frame"

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_validate_frame_accepts_valid_frame(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        is_valid, reason = cap._validate_frame(frame)
        assert is_valid is True
        assert reason == "valid"

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_validate_frame_detects_green_corruption(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:, :, 1] = 255
        is_valid, reason = cap._validate_frame(frame)
        assert is_valid is False
        assert reason == "green_corruption"


class TestRtspTransportFallback:
    """Tests for RTSP transport fallback strategy."""

    @patch.object(CameraCapture, "_open_network_capture")
    def test_rtsp_open_uses_alternate_transport_fallback(self, mock_open_network):
        first_cap = MagicMock()
        first_cap.isOpened.return_value = False

        second_cap = MagicMock()
        second_cap.isOpened.return_value = True

        mock_open_network.side_effect = [first_cap, second_cap]

        cap = CameraCapture("zone_test", "rtsp://192.168.1.100:554/stream", frame_rate=30)
        opened_cap = cap._open_capture()

        assert opened_cap is second_cap
        assert mock_open_network.call_count == 2

        expected_alternate = "udp" if RTSP_TRANSPORT == "tcp" else "tcp"
        assert mock_open_network.call_args_list[0].args[0] == RTSP_TRANSPORT
        assert mock_open_network.call_args_list[1].args[0] == expected_alternate

    @patch.object(CameraCapture, "_open_network_capture")
    def test_http_open_skips_rtsp_transport_fallback(self, mock_open_network):
        opened_cap = MagicMock()
        opened_cap.isOpened.return_value = True
        mock_open_network.return_value = opened_cap

        cap = CameraCapture("zone_test", "http://192.168.1.100:8080/video", frame_rate=30)
        result = cap._open_capture()

        assert result is opened_cap
        assert mock_open_network.call_count == 1
        assert mock_open_network.call_args_list[0].args[0] is None


class TestStallDetection:
    """Tests for stream stall detection."""

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_check_stall_returns_false_initially(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        cap._last_frame_time = time.time()
        assert cap._check_stall() is False

    @patch("detection_engine.camera.capture.cv2.VideoCapture")
    def test_check_stall_returns_true_after_threshold(self, mock_cv):
        mock_cv.return_value = MagicMock()
        cap = CameraCapture("zone_test", 0, frame_rate=30)
        cap._last_frame_time = time.time() - cap._stall_threshold - 1
        assert cap._check_stall() is True
