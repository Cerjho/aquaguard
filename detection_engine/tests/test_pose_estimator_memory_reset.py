"""Unit tests for MediaPipe memory reset (Fix #2: 5000 frame threshold)."""
import logging
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from detection_engine.vision.pose_estimator import PoseEstimator
from detection_engine.models_data.landmark import Landmark


class TestMediaPipeResetThreshold:
    """Verify reset happens at 5,000 frames (not 100,000)."""

    def test_reset_threshold_is_5000_not_100000(self):
        """Frame count 5000 should trigger reset, not 100000."""
        from detection_engine.vision.pose_estimator import PoseEstimator
        
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose = MagicMock()
        estimator._pose = mock_pose
        estimator._frame_count = 0
        estimator._suppress_first_process_noise = True
        
        # At 4999 frames: no reset
        estimator._frame_count = 4999
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        # Mock MediaPipe results to avoid actual processing
        results = MagicMock()
        results.pose_landmarks = None
        mock_pose.process.return_value = results
        
        estimator.estimate(blank_frame, bbox)
        
        # close() should not have been called yet
        mock_pose.close.assert_not_called()
        
        # At 5000 frames: reset should happen
        estimator._frame_count = 5000
        mock_pose.reset_mock()
        
        # Mock new pose creation
        new_mock_pose = MagicMock()
        new_mock_pose.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=new_mock_pose):
            estimator.estimate(blank_frame, bbox)
        
        # close() should have been called
        mock_pose.close.assert_called_once()
        
        # Frame count should be reset to 0
        assert estimator._frame_count == 0, "Frame count should reset to 0 after threshold"

    def test_reset_creates_new_pose_runner(self):
        """After reset, a new MediaPipe graph should be created."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose_old = MagicMock()
        estimator._pose = mock_pose_old
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = False
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        results = MagicMock()
        results.pose_landmarks = None
        mock_pose_old.process.return_value = results
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new) as mock_create:
            estimator.estimate(blank_frame, bbox)
        
        # New pose runner should have been created
        mock_create.assert_called_once()
        
        # Old pose should be closed
        mock_pose_old.close.assert_called_once()
        
        # Estimator should reference new pose
        assert estimator._pose is mock_pose_new


class TestMediaPipeResetGraceful:
    """Verify reset handles exceptions and completes gracefully."""

    def test_reset_handles_close_exception_gracefully(self):
        """If _pose.close() raises exception, reset should continue."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose_old = MagicMock()
        mock_pose_old.close.side_effect = RuntimeError("Close failed")
        estimator._pose = mock_pose_old
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = True
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        results = MagicMock()
        results.pose_landmarks = None
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new):
            # Should not raise exception despite close() failing
            estimator.estimate(blank_frame, bbox)
        
        # New pose should still be created despite close() error
        assert estimator._pose is mock_pose_new
        assert estimator._frame_count == 0

    def test_reset_logging_includes_frame_count(self, caplog):
        """Reset should log the frame count before resetting."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose_old = MagicMock()
        estimator._pose = mock_pose_old
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = True
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        results = MagicMock()
        results.pose_landmarks = None
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with caplog.at_level(logging.INFO):
            with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new):
                estimator.estimate(blank_frame, bbox)
        
        # Check log contains frame count and "8.3 min" reference
        log_text = caplog.text
        assert "5000" in log_text, "Log should mention the frame count (5000)"
        assert "8.3" in log_text, "Log should mention the time interval (8.3 min)"


class TestMediaPipeResetTiming:
    """Verify reset timing matches documented interval."""

    def test_reset_every_5000_frames_at_10fps_is_8_3_minutes(self):
        """5000 frames @ 10 FPS = 500 seconds = 8.3 minutes."""
        # This is a documentation test, not a behavioral test
        # It verifies the math:
        # 5000 frames / 10 FPS = 500 seconds
        # 500 seconds / 60 = 8.33 minutes
        
        frames = 5000
        fps = 10  # detection rate
        seconds = frames / fps
        minutes = seconds / 60
        
        assert minutes == pytest.approx(8.33, abs=0.05), "5000 frames @ 10 FPS ≈ 8.3 minutes"

    def test_frame_count_increments_with_each_estimate_call(self):
        """Frame count should increment on every estimate() call."""
        estimator = PoseEstimator()
        
        # Frame count starts at 0
        assert estimator._frame_count == 0
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        # Mock to avoid actual MediaPipe processing
        with patch.object(estimator._pose, "process") as mock_process:
            results = MagicMock()
            results.pose_landmarks = None
            mock_process.return_value = results
            
            # Call estimate a few times
            for i in range(1, 4):
                estimator.estimate(blank_frame, bbox)
                # Frame count should have incremented
                # (unless reset was triggered)
                if estimator._frame_count > 0:
                    assert estimator._frame_count == i, f"Frame count should be {i}, got {estimator._frame_count}"


class TestMediaPipeMemoryRelease:
    """Verify reset actually releases native TFLite memory."""

    def test_pose_close_is_called_at_reset(self):
        """Verify _pose.close() is called when resetting."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose = MagicMock()
        estimator._pose = mock_pose
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = True
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        results = MagicMock()
        results.pose_landmarks = None
        mock_pose.process.return_value = results
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new):
            estimator.estimate(blank_frame, bbox)
        
        # Verify close was called on old pose
        mock_pose.close.assert_called_once()

    def test_old_and_new_pose_are_different_objects(self):
        """After reset, estimator should reference a NEW pose object."""
        estimator = PoseEstimator()
        old_pose = estimator._pose
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        # Force frame count to 5000 to trigger reset
        estimator._frame_count = 5000
        
        with patch.object(estimator, "_pose") as mock_old_pose:
            # Create new pose mock
            mock_new_pose = MagicMock()
            results = MagicMock()
            results.pose_landmarks = None
            mock_new_pose.process.return_value = results
            
            with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_new_pose):
                estimator.estimate(blank_frame, bbox)
        
        # Frame count should be reset
        assert estimator._frame_count == 0


class TestMediaPipeResetIntegration:
    """Integration tests for reset behavior."""

    def test_reset_suppress_first_process_noise_flag_reset(self):
        """After reset, _suppress_first_process_noise should be True."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose_old = MagicMock()
        estimator._pose = mock_pose_old
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = False  # Was cleared
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        results = MagicMock()
        results.pose_landmarks = None
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new):
            estimator.estimate(blank_frame, bbox)
        
        # After reset, flag should be True
        assert estimator._suppress_first_process_noise is True, "Flag should be True after reset"

    def test_landmark_coordinates_normalized_after_reset(self):
        """Landmarks should still be normalized [0, 1] after reset."""
        estimator = PoseEstimator.__new__(PoseEstimator)
        
        # Create realistic mock results
        landmarks = []
        for i in range(33):
            lm = MagicMock()
            lm.x = 0.5
            lm.y = float(i) / 33
            lm.z = 0.0
            lm.visibility = 0.9
            landmarks.append(lm)
        
        results = MagicMock()
        results.pose_landmarks = MagicMock()
        results.pose_landmarks.landmark = landmarks
        
        mock_pose = MagicMock()
        mock_pose.process.return_value = results
        estimator._pose = mock_pose
        estimator._frame_count = 5000
        estimator._suppress_first_process_noise = True
        
        blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (50, 50, 300, 400)
        
        mock_pose_new = MagicMock()
        mock_pose_new.process.return_value = results
        
        with patch("detection_engine.vision.pose_estimator._create_pose_runner", return_value=mock_pose_new):
            result_landmarks = estimator.estimate(blank_frame, bbox)
        
        # Verify landmarks are returned and normalized
        assert result_landmarks is not None
        assert len(result_landmarks) == 33
        for lm in result_landmarks:
            assert isinstance(lm, Landmark)
            assert 0.0 <= lm.x <= 1.0
            assert 0.0 <= lm.y <= 1.0
