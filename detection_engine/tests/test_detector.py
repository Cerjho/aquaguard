"""Unit tests for DrowningDetector."""
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import torch


class TestDrowningDetectorInit:
    @patch("detection_engine.vision.detector.YOLO")
    @patch("detection_engine.vision.detector.torch.cuda.is_available", return_value=False)
    def test_uses_cpu_when_no_cuda(self, mock_cuda, mock_yolo):
        from detection_engine.vision.detector import DrowningDetector
        det = DrowningDetector("fake_model.pt")
        assert det.device == "cpu"
        mock_yolo.assert_called_once_with("fake_model.pt")

    @patch("detection_engine.vision.detector.YOLO")
    @patch("detection_engine.vision.detector.torch.cuda.is_available", return_value=True)
    def test_uses_cuda_when_available(self, mock_cuda, mock_yolo):
        from detection_engine.vision.detector import DrowningDetector
        det = DrowningDetector("fake_model.pt")
        assert det.device == "cuda"


class TestDrowningDetectorDetect:
    def _make_detector(self, mock_yolo_cls):
        from detection_engine.vision.detector import DrowningDetector
        det = DrowningDetector.__new__(DrowningDetector)
        det.device = "cpu"
        det.model = mock_yolo_cls
        return det

    def test_returns_empty_list_on_no_boxes(self):
        mock_model = MagicMock()
        result_obj = MagicMock()
        result_obj.boxes = None
        mock_model.track.return_value = [result_obj]
        det = self._make_detector(mock_model)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        assert det.detect(frame) == []

    def test_returns_empty_list_on_no_track_id(self):
        mock_model = MagicMock()
        boxes = MagicMock()
        boxes.id = None
        boxes.__len__ = MagicMock(return_value=1)
        result_obj = MagicMock()
        result_obj.boxes = boxes
        mock_model.track.return_value = [result_obj]
        det = self._make_detector(mock_model)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        assert det.detect(frame) == []

    def test_returns_detection_with_valid_boxes(self):
        from detection_engine.models_data.detection import Detection

        mock_model = MagicMock()
        boxes = MagicMock()
        boxes.id = torch.tensor([1.0])
        boxes.cls = torch.tensor([0.0])   # class 0 = "drowning"
        boxes.conf = torch.tensor([0.85])
        boxes.xyxy = torch.tensor([[10.0, 20.0, 100.0, 200.0]])
        boxes.__len__ = MagicMock(return_value=1)

        result_obj = MagicMock()
        result_obj.boxes = boxes
        mock_model.track.return_value = [result_obj]

        det = self._make_detector(mock_model)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        assert len(results) == 1
        d = results[0]
        assert isinstance(d, Detection)
        assert d.track_id == "1"
        assert d.class_label == "drowning"
        assert abs(d.confidence - 0.85) < 1e-4
        assert d.bbox == (10.0, 20.0, 100.0, 200.0)

    def test_returns_empty_on_runtime_error(self):
        mock_model = MagicMock()
        mock_model.track.side_effect = RuntimeError("unknown error")
        det = self._make_detector(mock_model)
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        assert det.detect(frame) == []

    def test_cuda_oom_falls_back_to_cpu(self):
        """CUDA OOM should retry on CPU and return results."""
        from detection_engine.models_data.detection import Detection

        boxes = MagicMock()
        boxes.id = torch.tensor([2.0])
        boxes.cls = torch.tensor([1.0])   # "swimming"
        boxes.conf = torch.tensor([0.7])
        boxes.xyxy = torch.tensor([[5.0, 5.0, 50.0, 50.0]])
        boxes.__len__ = MagicMock(return_value=1)

        result_obj = MagicMock()
        result_obj.boxes = boxes

        call_count = {"n": 0}

        def track_side_effect(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("CUDA out of memory")
            return [result_obj]

        mock_model = MagicMock()
        mock_model.track.side_effect = track_side_effect

        det = self._make_detector(mock_model)
        det.device = "cuda"
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        assert len(results) == 1
        assert results[0].class_label == "swimming"
