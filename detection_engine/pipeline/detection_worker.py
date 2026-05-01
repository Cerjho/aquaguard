"""
Detection Worker — AI Brain thread in the Three-Lane Highway.

Worker 2: Picks up frames from input queue, runs YOLO + pose estimation,
outputs annotated frames to the output queue.

Runs at AI speed (~10-15 FPS) independent of camera speed (30 FPS).

OPTIMIZATION: Pose estimation and behavior analysis run in parallel via
ThreadPoolExecutor to reduce GIL contention with camera feeder thread.
Goal: Reduce GIL hold time from 150ms → ~50ms per frame.
"""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    - Runs YOLO detection (GPU-bound, GIL-released during CUDA ops)
    - Spawns parallel tasks for pose + behavior analysis (CPU-bound, ThreadPool)
    - Writes annotated frames to output_queue
    - Calls detection_callback for each detection result

    GIL Optimization: Pose estimation and behavior analysis no longer block
    the main detection thread. They run in parallel via thread pool, reducing
    GIL contention with the camera feeder thread.
    """

    def __init__(
        self,
        zone_id: str,
        input_queue: FrameQueue,
        output_queue: AnnotatedFrameQueue,
        detector,  # DrowningDetector instance
        pose_estimator,
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
            pose_estimator: Shared PoseEstimator
            behavior_analyzer: BehaviorAnalyzer for this zone
            confidence_filter: ConfidenceFilter for this zone
            annotate_frame_fn:
                Function(frame, detections, zone_id, timestamp)
                -> annotated_frame
            detection_callback:
                Called with (zone_id, frame_data, filtered_detections)
                for each frame
            pose_analysis_workers:
                Number of worker threads for parallel pose+behavior analysis.
                Recommended: 2 (CPU-bound, avoid excessive context switching).
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

        # ThreadPoolExecutor for parallel pose + behavior analysis
        # This allows CPU-bound work to happen without blocking the main thread's GIL
        self._pose_analysis_executor = ThreadPoolExecutor(
            max_workers=pose_analysis_workers,
            thread_name_prefix=f"pose-analysis-{zone_id}",
        )

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
            "[%s] Detection worker started (pose_analysis_workers=2)",
            self.zone_id,
        )

    def stop(self) -> None:
        """Stop the detection worker thread and shutdown thread pool."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
        self._pose_analysis_executor.shutdown(wait=True, cancel_futures=False)
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

        Optimized flow:
        1. YOLO detection (GPU, ~50ms, main thread)
        2. Spawn parallel pose+behavior tasks (ThreadPool, ~50-100ms each, non-blocking)
        3. Wait for all tasks to complete (with timeout)
        4. Collect results and annotate frame
        5. Enqueue for streaming
        """
        frame = frame_data.frame
        timestamp = frame_data.timestamp

        # Step 1: YOLO detection (GPU inference, ~50-100ms)
        # YOLOv11s releases GIL during CUDA operations
        detections = self.detector.detect(frame)

        # Step 2: Parallel pose estimation + behavior analysis
        # Each detection is analyzed in parallel via thread pool
        # This prevents pose estimation from blocking the main detection thread's GIL
        pose_analysis_tasks = []
        for det in detections:
            future = self._pose_analysis_executor.submit(
                self._analyze_detection,
                frame=frame,
                detection=det,
            )
            pose_analysis_tasks.append((det, future))

        # Step 3: Collect results from all parallel tasks
        filtered_detections = []
        for det, future in pose_analysis_tasks:
            try:
                # Wait for this detection's pose+behavior analysis (with timeout)
                behavior_score = future.result(timeout=5.0)
                if behavior_score is not None:
                    det.behavior_flags = behavior_score
                    filtered_detections.append(det)
            except Exception as exc:
                logger.warning(
                    "[%s] Error collecting pose+behavior for detection %s: %s",
                    self.zone_id,
                    det.track_id,
                    exc,
                )

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

    def _analyze_detection(self, frame, detection) -> Optional[float]:
        """
        Analyze a single detection: pose estimation + behavior analysis.

        This runs in a thread pool worker, allowing multiple detections
        to be analyzed in parallel without blocking the main detection thread.

        Args:
            frame: Full BGR frame from camera.
            detection: Detection object with bbox and metadata.

        Returns:
            Behavior score [0.0, 1.0] or None if analysis failed.
        """
        try:
            # Pose estimation (CPU-bound, ~30-50ms per detection)
            landmarks = self.pose_estimator.estimate(frame, detection.bbox)

            if landmarks is None:
                return None

            # Behavior analysis (CPU-bound numpy, ~10-20ms per detection)
            behavior_score = self.behavior_analyzer.analyze(
                landmarks=landmarks,
                yolo_class=detection.class_label,
                yolo_conf=detection.confidence,
                track_id=str(detection.track_id),
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
