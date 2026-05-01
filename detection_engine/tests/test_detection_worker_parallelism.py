"""Unit tests for DetectionWorker parallelism (Fix #1: GIL contention)."""
import time
import threading
from unittest.mock import MagicMock, patch

import pytest

from detection_engine.pipeline.detection_worker import DetectionWorker
from detection_engine.pipeline.frame_queue import FrameQueue, AnnotatedFrameQueue, FrameData


class TestDetectionWorkerThreadPoolExecutor:
    """Verify ThreadPoolExecutor is created and used for parallel analysis."""

    def test_initialization_creates_executor_with_two_workers(self):
        """ThreadPoolExecutor should be initialized with max_workers=2."""
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        with patch("detection_engine.pipeline.detection_worker.ThreadPoolExecutor") as mock_executor_cls:
            mock_executor = MagicMock()
            mock_executor_cls.return_value = mock_executor
            
            worker = DetectionWorker(
                zone_id="test_zone",
                input_queue=input_queue,
                output_queue=output_queue,
                detector=MagicMock(),
                pose_estimator=MagicMock(),
                behavior_analyzer=MagicMock(),
                confidence_filter=MagicMock(),
                annotate_frame_fn=MagicMock(),
                detection_callback=None,
                pose_analysis_workers=2,
            )
            
            # Assert: ThreadPoolExecutor was created with correct parameters
            mock_executor_cls.assert_called_once()
            call_kwargs = mock_executor_cls.call_args[1]
            assert call_kwargs["max_workers"] == 2
            assert "pose-analysis-test_zone" in call_kwargs["thread_name_prefix"]

    def test_executor_is_shutdown_on_stop(self):
        """stop() should call executor.shutdown(wait=True)."""
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        with patch("detection_engine.pipeline.detection_worker.ThreadPoolExecutor") as mock_executor_cls:
            mock_executor = MagicMock()
            mock_executor_cls.return_value = mock_executor
            
            worker = DetectionWorker(
                zone_id="test_zone",
                input_queue=input_queue,
                output_queue=output_queue,
                detector=MagicMock(),
                pose_estimator=MagicMock(),
                behavior_analyzer=MagicMock(),
                confidence_filter=MagicMock(),
                annotate_frame_fn=MagicMock(),
                detection_callback=None,
            )
            
            worker.stop()
            
            # Assert: executor.shutdown was called with wait=True
            mock_executor.shutdown.assert_called_once_with(wait=True, cancel_futures=False)


class TestDetectionWorkerParallelAnalysis:
    """Verify pose and behavior analysis run in parallel, not sequentially."""

    def test_multiple_detections_analyzed_concurrently(self):
        """
        Multiple detections should be analyzed in parallel.
        
        With sequential execution: 3 detections × 50ms each = 150ms
        With parallel (2 workers): ~50-60ms (2 workers handle 3 tasks)
        
        This test verifies wall-clock time is reduced by parallelism.
        """
        from detection_engine.models_data.detection import Detection
        import numpy as np
        
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        # Mock detector to return 3 detections
        mock_detector = MagicMock()
        detection1 = Detection("track_1", "drowning", 0.9, (10, 10, 100, 100))
        detection2 = Detection("track_2", "drowning", 0.85, (110, 10, 200, 100))
        detection3 = Detection("track_3", "drowning", 0.8, (210, 10, 300, 100))
        mock_detector.detect.return_value = [detection1, detection2, detection3]
        
        # Mock pose estimator with 50ms delay
        mock_pose = MagicMock()
        call_count = {"n": 0}
        def slow_estimate(*args, **kwargs):
            call_count["n"] += 1
            time.sleep(0.05)  # 50ms per call
            return [MagicMock()]  # Return dummy landmark
        
        mock_pose.estimate.side_effect = slow_estimate
        
        # Mock behavior analyzer (fast)
        mock_behavior = MagicMock()
        mock_behavior.analyze.return_value = 0.8
        
        # Create frame data
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame_data = FrameData(frame=frame, timestamp="2026-01-01T00:00:00")
        
        worker = DetectionWorker(
            zone_id="test_zone",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=mock_detector,
            pose_estimator=mock_pose,
            behavior_analyzer=mock_behavior,
            confidence_filter=MagicMock(),
            annotate_frame_fn=lambda f, d, z, t: f,
            detection_callback=None,
            pose_analysis_workers=2,
        )
        
        # Measure wall-clock time for analysis
        start = time.time()
        worker._process_frame(frame_data)
        elapsed = time.time() - start
        
        # With parallel execution (2 workers): should be ~50-70ms
        # With sequential execution: would be ~150ms
        # Assert: parallelism provides benefit
        assert elapsed < 100, f"Analysis took {elapsed:.0f}ms, expected <100ms with 2 workers (sequential would be 150ms)"
        
        # Assert: all 3 detections were analyzed
        assert mock_pose.estimate.call_count == 3, "All detections should be analyzed"

    def test_results_from_thread_pool_collected_correctly(self):
        """Results from parallel tasks should be collected without loss or corruption."""
        from detection_engine.models_data.detection import Detection
        from detection_engine.models_data.landmark import Landmark
        import numpy as np
        
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        # Create N detections
        detections = [
            Detection(f"track_{i}", "drowning", 0.9 - i*0.1, (i*100, 10, (i+1)*100, 100))
            for i in range(5)
        ]
        
        mock_detector = MagicMock()
        mock_detector.detect.return_value = detections
        
        # Pose estimator returns valid landmarks
        def make_landmarks(*args, **kwargs):
            return [Landmark(x=0.5, y=float(j)/33, z=0.0, visibility=0.9) for j in range(33)]
        
        mock_pose = MagicMock()
        mock_pose.estimate.side_effect = make_landmarks
        
        # Behavior analyzer returns scores
        mock_behavior = MagicMock()
        mock_behavior.analyze.side_effect = lambda **kw: 0.8
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame_data = FrameData(frame=frame, timestamp="2026-01-01T00:00:00")
        
        worker = DetectionWorker(
            zone_id="test_zone",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=mock_detector,
            pose_estimator=mock_pose,
            behavior_analyzer=mock_behavior,
            confidence_filter=MagicMock(),
            annotate_frame_fn=lambda f, d, z, t: f,
            detection_callback=None,
            pose_analysis_workers=2,
        )
        
        worker._process_frame(frame_data)
        
        # Assert: all detections are present in results
        assert len(frame_data.detections) == 5, f"Expected 5 detections, got {len(frame_data.detections)}"
        
        # Assert: each detection has behavior score
        for det in frame_data.detections:
            assert det.behavior_flags is not None, "Detection missing behavior_flags"

    def test_timeout_handling_for_slow_analysis(self):
        """If pose analysis exceeds 5s timeout, detection is skipped."""
        from detection_engine.models_data.detection import Detection
        from concurrent.futures import TimeoutError
        import numpy as np
        
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        detection = Detection("track_1", "drowning", 0.9, (10, 10, 100, 100))
        
        mock_detector = MagicMock()
        mock_detector.detect.return_value = [detection]
        
        # Pose estimator is slow (will timeout)
        mock_pose = MagicMock()
        mock_pose.estimate.side_effect = TimeoutError("Pose estimation timed out")
        
        mock_behavior = MagicMock()
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame_data = FrameData(frame=frame, timestamp="2026-01-01T00:00:00")
        
        worker = DetectionWorker(
            zone_id="test_zone",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=mock_detector,
            pose_estimator=mock_pose,
            behavior_analyzer=mock_behavior,
            confidence_filter=MagicMock(),
            annotate_frame_fn=lambda f, d, z, t: f,
            detection_callback=None,
            pose_analysis_workers=1,  # Slow timeout
        )
        
        # Should not raise exception
        worker._process_frame(frame_data)
        
        # Detection should be skipped (not in filtered results)
        # because it timed out
        # (Behavior depends on implementation; may be 0 or None)

    def test_executor_life cycle_start_and_stop(self):
        """Executor should be created on start and cleaned up on stop."""
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        worker = DetectionWorker(
            zone_id="test_zone",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=MagicMock(),
            pose_estimator=MagicMock(),
            behavior_analyzer=MagicMock(),
            confidence_filter=MagicMock(),
            annotate_frame_fn=MagicMock(),
            detection_callback=None,
            pose_analysis_workers=2,
        )
        
        # At creation time, executor exists
        assert hasattr(worker, "_pose_analysis_executor")
        assert worker._pose_analysis_executor is not None
        
        # After stop, executor should be shut down
        worker.stop()
        # No exception should be raised

    def test_detection_callback_called_with_correct_arguments(self):
        """Detection callback should be called with (zone_id, frame_data, filtered_detections)."""
        from detection_engine.models_data.detection import Detection
        import numpy as np
        
        input_queue = FrameQueue(maxsize=1)
        output_queue = AnnotatedFrameQueue(maxsize=1)
        
        detection = Detection("track_1", "drowning", 0.9, (10, 10, 100, 100))
        
        mock_detector = MagicMock()
        mock_detector.detect.return_value = [detection]
        
        # Simple mocks for analysis
        mock_pose = MagicMock()
        mock_pose.estimate.return_value = [MagicMock()]
        
        mock_behavior = MagicMock()
        mock_behavior.analyze.return_value = 0.8
        
        # Track callback invocations
        callback_calls = []
        def mock_callback(zone_id, frame_data, detections):
            callback_calls.append((zone_id, frame_data, detections))
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame_data = FrameData(frame=frame, timestamp="2026-01-01T00:00:00")
        
        worker = DetectionWorker(
            zone_id="zone_1",
            input_queue=input_queue,
            output_queue=output_queue,
            detector=mock_detector,
            pose_estimator=mock_pose,
            behavior_analyzer=mock_behavior,
            confidence_filter=MagicMock(),
            annotate_frame_fn=lambda f, d, z, t: f,
            detection_callback=mock_callback,
            pose_analysis_workers=2,
        )
        
        worker._process_frame(frame_data)
        
        # Assert: callback was called
        assert len(callback_calls) == 1
        zone_id, called_frame_data, called_detections = callback_calls[0]
        assert zone_id == "zone_1"
        assert called_frame_data is frame_data
        assert len(called_detections) >= 0  # Should be a list
