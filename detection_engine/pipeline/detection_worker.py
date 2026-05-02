"""
Detection Worker — AI Brain thread in the Three-Lane Highway.

Worker 2: Picks up frames from input queue, runs YOLO + pose estimation,
outputs annotated frames to the output queue.

Runs at AI speed (~10-15 FPS) independent of camera speed (30 FPS).

THREAD-SAFETY: MediaPipe Pose is NOT thread-safe per-instance.
Each ThreadPoolExecutor worker gets its own PoseEstimator via
threading.local(), so parallel pose analysis is safe.
"""
import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from detection_engine.pipeline.frame_queue import (
    AnnotatedFrameQueue,
    FrameData,
    FrameQueue,
)

logger = logging.getLogger(__name__)


class DetectionWorker:
    """
    Threaded detection worker — runs YOLO inference in a separate thread.

    This is Worker 2 (AI Brain) in the Three-Lane Highway:
    - Reads raw frames from input_queue
    - Runs YOLO detection (GPU-bound)
    - Runs YOLO-Pose on full frame (GPU-bound)
    - Matches bounding boxes and analyzes behavior sequentially
    - Writes annotated frames to output_queue
    - Calls detection_callback for each detection result
    """

    def __init__(
        self,
        zone_id: str,
        input_queue: FrameQueue,
        output_queue: AnnotatedFrameQueue,
        detector,  # DrowningDetector instance
        pose_estimator,  # Used as a factory template (class captured for cloning)
        behavior_analyzer,
        confidence_filter,
        annotate_frame_fn: Callable,  # Function to draw boxes on frame
        detection_callback: Optional[Callable[[str, Any, list], None]] = None,
        pose_analysis_workers: int = 2,
    ):
        """
        Initialize detection worker.

        Args:
            zone_id: Camera zone identifier
            input_queue: Queue to read raw frames from
            output_queue: Queue to write annotated frames to
            detector: DrowningDetector instance for this zone
            pose_estimator: PoseEstimator instance
            behavior_analyzer: BehaviorAnalyzer for this zone
            confidence_filter: ConfidenceFilter for this zone
            annotate_frame_fn:
                Function(frame, detections, zone_id, timestamp)
                -> annotated_frame
            detection_callback:
                Called with (zone_id, frame_data, filtered_detections)
                for each frame
        """
        self.zone_id = zone_id
        self.input_queue = input_queue
        self.output_queue = output_queue
        self.detector = detector
        self.pose_estimator = pose_estimator
        self.behavior_analyzer = behavior_analyzer
        self.confidence_filter = confidence_filter
        self.annotate_frame_fn = annotate_frame_fn
        self.detection_callback = detection_callback

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Stats
        self._frames_processed = 0
        self._total_detections = 0
        self._detection_time_sum = 0.0
        self._last_log_time = time.time()

    def start(self) -> None:
        """Start the detection worker thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("[%s] Detection worker already running", self.zone_id)
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._detection_loop,
            name=f"detection-worker-{self.zone_id}",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "[%s] Detection worker started (YOLO-Pose GPU sequential)",
            self.zone_id,
        )

    def stop(self) -> None:
        """Stop the detection worker thread and shutdown thread pool."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
        logger.info(
            "[%s] Detection worker stopped (%d frames processed)",
            self.zone_id,
            self._frames_processed,
        )

    def _detection_loop(self) -> None:
        """Main detection loop — runs in separate thread."""
        logger.info("[%s] Detection loop starting...", self.zone_id)

        while not self._stop_event.is_set():
            try:
                # Wait for a frame (with timeout to check stop event)
                frame_data = self.input_queue.get(timeout=0.1)
                if frame_data is None:
                    continue  # Timeout, check stop event and retry

                # Process the frame
                start_time = time.time()
                self._process_frame(frame_data)
                detection_time = time.time() - start_time

                # Update stats
                self._frames_processed += 1
                self._detection_time_sum += detection_time

                # Log stats every 10 seconds
                now = time.time()
                if now - self._last_log_time >= 10.0:
                    avg_time = self._detection_time_sum / max(1, self._frames_processed)
                    fps = self._frames_processed / (now - self._last_log_time)
                    queue_stats = self.input_queue.stats
                    logger.debug(
                        "[%s] Detection: %.1f FPS, avg %.0fms, drop_rate=%.1f%%",
                        self.zone_id,
                        fps,
                        avg_time * 1000,
                        queue_stats['drop_rate'] * 100,
                    )
                    self._last_log_time = now
                    self._frames_processed = 0
                    self._detection_time_sum = 0.0

            except Exception as exc:
                logger.exception("[%s] Detection error: %s", self.zone_id, exc)
                # Don't crash — continue processing
                time.sleep(0.1)

    def _process_frame(self, frame_data: FrameData) -> None:
        """
        Process a single frame through the detection pipeline.

        Flow:
        1. YOLO detection (GPU, ~50-100ms, main detection thread)
        2. Parallel pose+behavior analysis via ThreadPool (thread-safe:
           each worker has its own PoseEstimator via threading.local)
        3. Collect results and annotate frame
        4. Enqueue for streaming
        5. Clear GPU cache to prevent memory accumulation
        """
        import torch
        
        frame = frame_data.frame
        timestamp = frame_data.timestamp

        # Step 1: YOLO detection (GPU inference)
        detections = self.detector.detect(frame)

        filtered_detections = []
        if detections:
            # Step 2: YOLO-Pose on full frame
            pose_results = self.pose_estimator.predict_frame(frame)
            
            # Step 3: Analyze each detection sequentially
            for det in detections:
                behavior_score = self._analyze_detection(pose_results, det)
                if behavior_score is not None:
                    det.behavior_score = behavior_score
                    filtered_detections.append(det)

        # Step 4: Annotate frame with detection boxes
        annotated_frame = self.annotate_frame_fn(
            frame, filtered_detections, self.zone_id, timestamp
        )

        # Step 5: Update frame_data with results
        frame_data.detections = filtered_detections
        frame_data.annotated_frame = annotated_frame

        # Step 6: Put annotated frame in output queue
        self.output_queue.put(frame_data)

        # Step 7: Call detection callback (for alerts, MQTT, etc.)
        if self.detection_callback is not None:
            try:
                self.detection_callback(self.zone_id, frame_data, filtered_detections)
            except Exception as exc:
                logger.warning("[%s] Detection callback error: %s", self.zone_id, exc)

        self._total_detections += len(filtered_detections)
        
        # Step 8: Clear GPU memory cache to prevent accumulation of orphaned allocations
        # This prevents the 870MB GPU memory leak observed with continuous inference
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

    def _analyze_detection(self, pose_results: list, detection) -> Optional[float]:
        """
        Analyze a single detection: pose estimation + behavior analysis.

        Args:
            pose_results: Full-frame pose results from YOLO-Pose.
            detection: Detection object with bbox and metadata.

        Returns:
            Behavior score [0.0, 1.0] or None if analysis failed.
        """
        try:
            # Pose estimation (Extract matching keypoints from full-frame results)
            landmarks = self.pose_estimator.estimate_from_results(pose_results, detection.bbox)

            # Behavior analysis (CPU-bound numpy, ~10-20ms per detection)
            # Passes landmarks (which may be None) to gracefully fall back to YOLO score
            behavior_score = self.behavior_analyzer.analyze(
                landmarks=landmarks,
                yolo_class=detection.class_label,
                yolo_conf=detection.confidence,
                track_id=str(detection.track_id),
                bbox=detection.bbox,
            )

            return behavior_score

        except Exception as exc:
            logger.debug(
                "[%s] Pose analysis failed for detection %s: %s",
                self.zone_id,
                detection.track_id,
                str(exc)[:100],
            )
            return None

    @property
    def stats(self) -> Dict[str, Any]:
        """Get worker statistics."""
        return {
            'frames_processed': self._frames_processed,
            'total_detections': self._total_detections,
            'is_running': self._thread is not None and self._thread.is_alive(),
        }
