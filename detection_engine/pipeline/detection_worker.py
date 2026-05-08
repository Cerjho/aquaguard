"""
Detection Worker — AI Brain thread in the Three-Lane Highway.

Worker 2: Picks up frames from input queue, runs YOLO + pose estimation,
outputs annotated frames to the output queue.

Runs at AI speed (~10-15 FPS) independent of camera speed (30 FPS).

Three-tier backpressure system monitors queue_depth() and adjusts
inference resolution + frame filtering to prevent queue overrun:
  NORMAL  (depth <0.5)  — full resolution, all frames
  PRESSURE (0.5–0.8)   — skip LOW frames, imgsz=960
  OVERLOAD (≥0.8)      — CRITICAL/HIGH only, imgsz=640, MQTT warning

THREAD-SAFETY: MediaPipe Pose is NOT thread-safe per-instance.
Each ThreadPoolExecutor worker gets its own PoseEstimator via
threading.local(), so parallel pose analysis is safe.
"""
import enum
import json
import logging
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np

from detection_engine.pipeline.frame_queue import (
    AnnotatedFrameQueue,
    FrameData,
    FramePriority,
    PriorityFrameQueue,
)
from detection_engine.memory_manager import get_gpu_memory_manager

logger = logging.getLogger(__name__)

# ── Backpressure thresholds ──────────────────────────────────────────────────
_PRESSURE_DEPTH = 0.5
_OVERLOAD_DEPTH = 0.8

# Resolution overrides per backpressure tier
_NORMAL_IMGSZ = None   # Use default from settings.py
_PRESSURE_IMGSZ = 960
_OVERLOAD_IMGSZ = 640

_BACKPRESSURE_MQTT_TOPIC = "aquaguard/system/backpressure_warning"


class BackpressureTier(enum.IntEnum):
    """Detection worker backpressure tiers."""
    NORMAL = 0
    PRESSURE = 1
    OVERLOAD = 2


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
        input_queue: PriorityFrameQueue,
        output_queue: AnnotatedFrameQueue,
        detector,  # DrowningDetector instance
        pose_estimator,  # Used as a factory template (class captured for cloning)
        behavior_analyzer,
        confidence_filter,
        annotate_frame_fn: Callable,  # Function to draw boxes on frame
        detection_callback: Optional[Callable[[str, Any, list], None]] = None,
        pose_analysis_workers: int = 2,
        gpu_memory_manager=None,
        mqtt_client=None,
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
            mqtt_client: Optional MQTTClient for backpressure warnings
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
        self.gpu_memory_manager = gpu_memory_manager or get_gpu_memory_manager()
        self._mqtt_client = mqtt_client

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Backpressure state
        self._backpressure_tier = BackpressureTier.NORMAL
        self._overload_warning_sent = False  # Prevents per-frame MQTT spam

        # Stats
        self._frames_processed = 0
        self._total_detections = 0
        self._detection_time_sum = 0.0
        self._last_log_time = time.time()
        self._frames_skipped_corrupted = 0
        self._frames_skipped_backpressure = 0

    def start(self) -> None:
        """Start the detection worker thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("[%s] Detection worker already running", self.zone_id)
            return

        self._stop_event.clear()
        self.gpu_memory_manager.initialize()
        self._thread = threading.Thread(
            target=self._detection_loop,
            name=f"detection-worker-{self.zone_id}",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "[%s] Detection worker started (YOLO-Pose GPU sequential, backpressure enabled)",
            self.zone_id,
        )

    def stop(self) -> None:
        """Stop the detection worker thread and shutdown thread pool."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
        logger.info(
            "[%s] Detection worker stopped (%d frames processed, %d corrupted skipped, "
            "%d backpressure skipped)",
            self.zone_id,
            self._frames_processed,
            self._frames_skipped_corrupted,
            self._frames_skipped_backpressure,
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

                # Evaluate backpressure tier before processing
                self._update_backpressure_tier()

                # Apply backpressure frame filtering
                if self._should_skip_frame(frame_data):
                    self._frames_skipped_backpressure += 1
                    continue

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
                        "[%s] Detection: %.1f FPS, avg %.0fms, drop_rate=%.1f%%, "
                        "tier=%s, corrupted_skipped=%d, bp_skipped=%d",
                        self.zone_id,
                        fps,
                        avg_time * 1000,
                        queue_stats['drop_rate'] * 100,
                        self._backpressure_tier.name,
                        self._frames_skipped_corrupted,
                        self._frames_skipped_backpressure,
                    )
                    self._last_log_time = now
                    self._frames_processed = 0
                    self._detection_time_sum = 0.0

            except Exception as exc:
                logger.exception("[%s] Detection error: %s", self.zone_id, exc)
                # Don't crash — continue processing
                time.sleep(0.1)

    # ── Backpressure ─────────────────────────────────────────────────────────

    def _update_backpressure_tier(self) -> None:
        """Read queue depth and transition backpressure tier if needed."""
        depth = self.input_queue.queue_depth()

        if depth >= _OVERLOAD_DEPTH:
            new_tier = BackpressureTier.OVERLOAD
        elif depth >= _PRESSURE_DEPTH:
            new_tier = BackpressureTier.PRESSURE
        else:
            new_tier = BackpressureTier.NORMAL

        if new_tier != self._backpressure_tier:
            old_tier = self._backpressure_tier
            self._backpressure_tier = new_tier
            logger.warning(
                "[%s] Backpressure tier transition: %s → %s (depth=%.2f)",
                self.zone_id,
                old_tier.name,
                new_tier.name,
                depth,
            )

            # Publish MQTT warning ONCE on entry to OVERLOAD
            if new_tier == BackpressureTier.OVERLOAD:
                self._overload_warning_sent = False

            if (
                new_tier == BackpressureTier.OVERLOAD
                and not self._overload_warning_sent
            ):
                self._publish_backpressure_warning(depth)
                self._overload_warning_sent = True

            # Reset flag when leaving OVERLOAD so next entry triggers again
            if (
                old_tier == BackpressureTier.OVERLOAD
                and new_tier != BackpressureTier.OVERLOAD
            ):
                self._overload_warning_sent = False

    def _should_skip_frame(self, frame_data: FrameData) -> bool:
        """Decide whether to skip this frame based on backpressure tier."""
        priority = getattr(frame_data, 'priority', FramePriority.LOW)

        if self._backpressure_tier == BackpressureTier.PRESSURE:
            # Skip LOW frames in PRESSURE mode
            return priority == FramePriority.LOW

        if self._backpressure_tier == BackpressureTier.OVERLOAD:
            # CRITICAL and HIGH only in OVERLOAD mode
            return priority == FramePriority.LOW

        return False  # NORMAL — process all

    def _get_imgsz_override(self) -> Optional[int]:
        """Return imgsz override based on current backpressure tier.

        Returns None when the default (from settings.py) should be used.
        """
        if self._backpressure_tier == BackpressureTier.PRESSURE:
            return _PRESSURE_IMGSZ
        if self._backpressure_tier == BackpressureTier.OVERLOAD:
            return _OVERLOAD_IMGSZ
        return _NORMAL_IMGSZ  # None → use default

    def _publish_backpressure_warning(self, depth: float) -> None:
        """Publish backpressure OVERLOAD warning via MQTT (QoS 0)."""
        if self._mqtt_client is None:
            return
        try:
            from datetime import datetime, timezone
            payload = {
                "message_type": "backpressure_warning",
                "zone_id": self.zone_id,
                "queue_depth": round(depth, 3),
                "tier": "OVERLOAD",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self._mqtt_client._client.publish(
                _BACKPRESSURE_MQTT_TOPIC,
                json.dumps(payload),
                qos=0,
            )
            logger.warning(
                "[%s] Published backpressure OVERLOAD warning (depth=%.2f)",
                self.zone_id, depth,
            )
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error(
                "[%s] Failed to publish backpressure warning: %s",
                self.zone_id, exc,
            )

    # ── Frame processing ─────────────────────────────────────────────────────

    def _validate_frame(self, frame: np.ndarray) -> Tuple[bool, str]:
        """
        Validate frame data before GPU inference.

        Catches: NaN, Inf, wrong shape, wrong dtype, empty frames.
        This prevents corrupted frames (from RTSP reconnects) from
        crashing the GPU with "CUDA unknown error".

        Returns: (is_valid, reason)
        """
        if frame is None:
            return False, "frame_is_none"
        if frame.size == 0:
            return False, "empty_frame"
        if len(frame.shape) != 3:
            return False, f"invalid_dimensions_{len(frame.shape)}"

        height, width, channels = frame.shape
        if height < 10 or width < 10:
            return False, "frame_too_small"
        if channels != 3:
            return False, f"invalid_channels_{channels}"

        # Check for NaN values (corrupted from RTSP or memory issues)
        # This is a common result of H.264 decode failures
        if np.isnan(frame).any():
            return False, "frame_contains_nan"

        # Check for Inf values (corrupted floating-point data)
        if np.isinf(frame).any():
            return False, "frame_contains_inf"

        # Check for completely black frames (likely corrupted)
        if np.max(frame) == 0:
            return False, "all_black_frame"

        # Check for extremely low variance (solid color or corrupt)
        if np.std(frame) < 0.1:
            return False, "no_variance"

        return True, "valid"

    def _process_frame(self, frame_data: FrameData) -> None:
        """
        Process a single frame through the detection pipeline.

        Flow:
        1. VALIDATE frame data (catch corrupted frames from RTSP reconnects)
        2. YOLO detection (GPU, ~50-100ms, main detection thread)
           — resolution adjusted by backpressure tier
        3. Parallel pose+behavior analysis via ThreadPool (thread-safe:
           each worker has its own PoseEstimator via threading.local)
        4. Collect results and annotate frame
        5. Enqueue for streaming
        6. Clear GPU cache to prevent memory accumulation
        """
        frame = frame_data.frame
        timestamp = frame_data.timestamp

        # Step 0: VALIDATE frame before GPU inference (FIX: catches corrupted frames)
        is_valid, reason = self._validate_frame(frame)
        if not is_valid:
            logger.debug(
                "[%s] Skipping corrupted frame: %s",
                self.zone_id,
                reason,
            )
            self._frames_skipped_corrupted += 1
            return  # Skip this frame, don't crash GPU

        # Step 1: YOLO detection (GPU inference)
        # Apply backpressure imgsz override if active
        imgsz_override = self._get_imgsz_override()
        if imgsz_override is not None:
            # Temporarily override the detector's inference resolution
            original_imgsz = None
            if hasattr(self.detector, '_track_inference'):
                original_imgsz = self._override_detector_imgsz(imgsz_override)
            try:
                detections = self.detector.detect(frame)
            finally:
                if original_imgsz is not None:
                    self._restore_detector_imgsz(original_imgsz)
        else:
            detections = self.detector.detect(frame)

        # Signal active detection state to priority queue for next frames
        has_active = bool(detections)
        self.input_queue.set_active_detection(has_active)

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

        # Step 8: Bounded CUDA cache trimming to control long-run VRAM growth.
        self.gpu_memory_manager.record_inference_complete()

    def _override_detector_imgsz(self, new_imgsz: int) -> int:
        """Temporarily override YOLO_IMGSZ for backpressure.

        Returns the original imgsz value for restoration.
        """
        import config.settings as settings
        original = settings.YOLO_IMGSZ
        settings.YOLO_IMGSZ = new_imgsz
        return original

    def _restore_detector_imgsz(self, original_imgsz: int) -> None:
        """Restore the original YOLO_IMGSZ setting."""
        import config.settings as settings
        settings.YOLO_IMGSZ = original_imgsz

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
            'frames_skipped_corrupted': self._frames_skipped_corrupted,
            'frames_skipped_backpressure': self._frames_skipped_backpressure,
            'backpressure_tier': self._backpressure_tier.name,
            'is_running': self._thread is not None and self._thread.is_alive(),
        }
