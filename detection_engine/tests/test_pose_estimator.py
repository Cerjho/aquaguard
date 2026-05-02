"""Unit tests for PoseEstimator."""
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from detection_engine.models_data.landmark import Landmark
from detection_engine.vision.pose_estimator import PoseEstimator

@patch("detection_engine.vision.pose_estimator.torch")
@patch("detection_engine.vision.pose_estimator.YOLO")
def _make_pose_estimator(mock_yolo, mock_torch):
    """Create a PoseEstimator whose internal YOLO is mocked."""
    return PoseEstimator(model_path="dummy.pt")

def _fake_yolo_pose_results(n_det: int = 1, conf: float = 0.9):
    """Return a mock object that mimics YOLO-Pose results."""
    # Keypoints data shape: (num_det, 17, 3) -> [x, y, conf]
    kp_data = np.zeros((n_det, 17, 3), dtype=np.float32)
    for i in range(17):
        kp_data[:, i, 0] = 100.0  # absolute x
        kp_data[:, i, 1] = float(i) * 10.0  # absolute y
        kp_data[:, i, 2] = conf

    # Boxes xyxy shape: (num_det, 4)
    boxes_data = np.zeros((n_det, 4), dtype=np.float32)
    boxes_data[:, 0] = 50.0  # x1
    boxes_data[:, 1] = 0.0   # y1
    boxes_data[:, 2] = 150.0 # x2
    boxes_data[:, 3] = 200.0 # y2

    mock_keypoints = MagicMock()
    mock_keypoints.data = MagicMock()
    mock_keypoints.data.cpu.return_value.numpy.return_value = kp_data

    mock_boxes = MagicMock()
    mock_boxes.__len__.return_value = n_det
    mock_boxes.xyxy = MagicMock()
    mock_boxes.xyxy.cpu.return_value.numpy.return_value = boxes_data

    results = MagicMock()
    results.keypoints = mock_keypoints
    results.boxes = mock_boxes

    return [results]

class TestPoseEstimatorEstimate:
    @patch("detection_engine.vision.pose_estimator.torch")
    @patch("detection_engine.vision.pose_estimator.YOLO")
    def test_returns_33_landmarks_on_success(self, mock_yolo, mock_torch, blank_frame):
        estimator = PoseEstimator(model_path="dummy.pt")
        results = _fake_yolo_pose_results()
        bbox = (40.0, 0.0, 160.0, 200.0)  # High IoU with (50, 0, 150, 200)
        landmarks = estimator.estimate_from_results(results, bbox)
        assert landmarks is not None
        assert len(landmarks) == 33
        assert all(isinstance(lm, Landmark) for lm in landmarks)

    @patch("detection_engine.vision.pose_estimator.torch")
    @patch("detection_engine.vision.pose_estimator.YOLO")
    def test_returns_none_when_no_pose_landmarks(self, mock_yolo, mock_torch, blank_frame):
        estimator = PoseEstimator(model_path="dummy.pt")
        results = MagicMock()
        results.boxes = None
        bbox = (50.0, 50.0, 300.0, 400.0)
        assert estimator.estimate_from_results([results], bbox) is None

    @patch("detection_engine.vision.pose_estimator.torch")
    @patch("detection_engine.vision.pose_estimator.YOLO")
    def test_returns_none_on_low_iou(self, mock_yolo, mock_torch, blank_frame):
        estimator = PoseEstimator(model_path="dummy.pt")
        results = _fake_yolo_pose_results()
        bbox = (1000.0, 1000.0, 1100.0, 1200.0)  # No overlap
        assert estimator.estimate_from_results(results, bbox) is None

    @patch("detection_engine.vision.pose_estimator.torch")
    @patch("detection_engine.vision.pose_estimator.YOLO")
    def test_landmark_coordinates_are_normalized(self, mock_yolo, mock_torch, blank_frame):
        """All landmark x, y values must be in [0.0, 1.0] relative to bbox."""
        estimator = PoseEstimator(model_path="dummy.pt")
        results = _fake_yolo_pose_results(conf=0.8)
        bbox = (50.0, 0.0, 150.0, 200.0)
        landmarks = estimator.estimate_from_results(results, bbox)
        assert landmarks is not None
        for i, lm in enumerate(landmarks):
            if lm.visibility > 0:  # Only check mapped ones
                assert 0.0 <= lm.x <= 1.0, f"x={lm.x} out of normalized range"
                assert 0.0 <= lm.y <= 1.0, f"y={lm.y} out of normalized range"

    @patch("detection_engine.vision.pose_estimator.torch")
    @patch("detection_engine.vision.pose_estimator.YOLO")
    def test_landmark_visibility_preserved(self, mock_yolo, mock_torch, blank_frame):
        estimator = PoseEstimator(model_path="dummy.pt")
        results = _fake_yolo_pose_results(conf=0.42)
        bbox = (50.0, 0.0, 150.0, 200.0)
        landmarks = estimator.estimate_from_results(results, bbox)
        assert landmarks is not None
        # Nose (idx 0) is mapped
        assert abs(landmarks[0].visibility - 0.42) < 1e-6
