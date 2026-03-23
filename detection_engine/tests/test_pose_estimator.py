"""Unit tests for PoseEstimator."""
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from detection_engine.models_data.landmark import Landmark


def _make_pose_estimator_with_mock(mock_results):
    """Create a PoseEstimator whose internal MediaPipe is replaced with a mock."""
    from detection_engine.vision.pose_estimator import PoseEstimator

    estimator = PoseEstimator.__new__(PoseEstimator)
    mock_pose = MagicMock()
    mock_pose.process.return_value = mock_results
    estimator._pose = mock_pose
    return estimator


def _fake_mediapipe_results(n_landmarks: int = 33, visibility: float = 0.9):
    """Return a mock object that mimics mediapipe pose results."""
    lm_list = []
    for i in range(n_landmarks):
        lm = MagicMock()
        lm.x = 0.5
        lm.y = float(i) / n_landmarks
        lm.z = 0.0
        lm.visibility = visibility
        lm_list.append(lm)

    results = MagicMock()
    results.pose_landmarks = MagicMock()
    results.pose_landmarks.landmark = lm_list
    return results


class TestPoseEstimatorEstimate:
    def test_returns_33_landmarks_on_success(self, blank_frame):
        results = _fake_mediapipe_results(33)
        estimator = _make_pose_estimator_with_mock(results)
        bbox = (50.0, 50.0, 300.0, 400.0)
        landmarks = estimator.estimate(blank_frame, bbox)
        assert landmarks is not None
        assert len(landmarks) == 33
        assert all(isinstance(lm, Landmark) for lm in landmarks)

    def test_returns_none_when_no_pose_landmarks(self, blank_frame):
        results = MagicMock()
        results.pose_landmarks = None
        estimator = _make_pose_estimator_with_mock(results)
        bbox = (50.0, 50.0, 300.0, 400.0)
        assert estimator.estimate(blank_frame, bbox) is None

    def test_returns_none_on_invalid_bbox(self, blank_frame):
        """Bounding box with zero area after clamping returns None."""
        results = _fake_mediapipe_results()
        estimator = _make_pose_estimator_with_mock(results)
        # x2 <= x1 → invalid
        bbox = (200.0, 100.0, 100.0, 400.0)
        assert estimator.estimate(blank_frame, bbox) is None

    def test_clamps_bbox_to_frame_boundaries(self, blank_frame):
        """Out-of-bound bbox values are clamped — no exception raised."""
        results = _fake_mediapipe_results()
        estimator = _make_pose_estimator_with_mock(results)
        # bbox extends beyond frame (640x480)
        bbox = (-50.0, -50.0, 700.0, 600.0)
        landmarks = estimator.estimate(blank_frame, bbox)
        # Clamped to (0,0,640,480) — valid ROI → landmarks returned
        assert landmarks is not None

    def test_returns_none_when_mediapipe_raises(self, blank_frame):
        """MediaPipe exception should be caught and None returned."""
        from detection_engine.vision.pose_estimator import PoseEstimator
        estimator = PoseEstimator.__new__(PoseEstimator)
        mock_pose = MagicMock()
        mock_pose.process.side_effect = RuntimeError("MediaPipe crash")
        estimator._pose = mock_pose
        bbox = (50.0, 50.0, 300.0, 400.0)
        assert estimator.estimate(blank_frame, bbox) is None

    def test_landmark_coordinates_are_normalized(self, blank_frame):
        """All landmark x, y values must be in [0.0, 1.0] as returned by MediaPipe."""
        results = _fake_mediapipe_results(33, visibility=0.8)
        estimator = _make_pose_estimator_with_mock(results)
        bbox = (50.0, 50.0, 300.0, 400.0)
        landmarks = estimator.estimate(blank_frame, bbox)
        assert landmarks is not None
        for lm in landmarks:
            assert 0.0 <= lm.x <= 1.0, f"x={lm.x} out of normalized range"
            assert 0.0 <= lm.y <= 1.0, f"y={lm.y} out of normalized range"

    def test_landmark_visibility_preserved(self, blank_frame):
        results = _fake_mediapipe_results(33, visibility=0.42)
        estimator = _make_pose_estimator_with_mock(results)
        bbox = (10.0, 10.0, 200.0, 300.0)
        landmarks = estimator.estimate(blank_frame, bbox)
        assert landmarks is not None
        assert all(abs(lm.visibility - 0.42) < 1e-6 for lm in landmarks)
