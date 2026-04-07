"""
Detection Worker — AI Brain thread in the Three-Lane Highway.

Worker 2: Picks up frames from input queue, runs YOLO + pose estimation,
outputs annotated frames to the output queue.

Runs at AI speed (~10-15 FPS) independent of camera speed (30 FPS).
"""
import logging
import threading
import time
from typing import Optional, Callable, Dict, Any

from detection_engine.pipeline.frame_queue import FrameQueue, AnnotatedFrameQueue, FrameData

logger = logging.getLogger(__name__)


class DetectionWorker:
    """
    Threaded detection worker — runs YOLO inference in a separate thread.
    
    This is Worker 2 (AI Brain) in the Three-Lane Highway:
    - Reads raw frames from input_queue
    - Runs YOLO detection + pose estimation
    - Writes annotated frames to output_queue
    - Calls detection_callback for each detection result
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
            annotate_frame_fn: Function(frame, detections, zone_id, timestamp) -> annotated_frame
            detection_callback: Called with (zone_id, frame_data, filtered_detections) for each frame
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
            daemon=True
        )
        self._thread.start()
        logger.info("[%s] Detection worker started", self.zone_id)
    
    def stop(self) -> None:
        """Stop the detection worker thread."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
        logger.info("[%s] Detection worker stopped (%d frames processed)", 
                    self.zone_id, self._frames_processed)
    
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
                        self.zone_id, fps, avg_time * 1000, queue_stats['drop_rate'] * 100
                    )
                    self._last_log_time = now
                    self._frames_processed = 0
                    self._detection_time_sum = 0.0
                    
            except Exception as exc:
                logger.exception("[%s] Detection error: %s", self.zone_id, exc)
                # Don't crash — continue processing
                time.sleep(0.1)
    
    def _process_frame(self, frame_data: FrameData) -> None:
        """Process a single frame through the detection pipeline."""
        frame = frame_data.frame
        timestamp = frame_data.timestamp
        
        # Step 1: YOLO detection
        detections = self.detector.detect(frame)
        
        # Step 2: Pose estimation + behavior analysis for each detection
        filtered_detections = []
        for det in detections:
            try:
                landmarks = self.pose_estimator.estimate(frame, det.bbox)
                if landmarks is not None:
                    behavior_flags = self.behavior_analyzer.analyze(
                        track_id=str(det.track_id),
                        landmarks=landmarks,
                    )
                    det.behavior_flags = behavior_flags
                
                # Step 3: Confidence filtering
                final_det = self.confidence_filter.filter(det)
                if final_det is not None:
                    filtered_detections.append(final_det)
                    
            except Exception as exc:
                logger.warning("[%s] Error processing detection %s: %s", 
                             self.zone_id, det.track_id, exc)
        
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
    
    @property
    def stats(self) -> Dict[str, Any]:
        """Get worker statistics."""
        return {
            'frames_processed': self._frames_processed,
            'total_detections': self._total_detections,
            'is_running': self._thread is not None and self._thread.is_alive(),
        }
