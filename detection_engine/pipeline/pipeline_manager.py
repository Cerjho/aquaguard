"""
Pipeline Manager — Orchestrates the Three-Lane Highway architecture.

Manages all three workers for each camera zone:
1. Camera Capture (Worker 1) — already exists in CameraCapture class
2. Detection Worker (Worker 2) — runs YOLO in separate thread
3. Frame Writer (Worker 3) — writes frames at 30 FPS for streaming

This ensures smooth video regardless of AI detection speed.
"""
import logging
import threading
import time
from typing import Dict, Optional, Callable, Any
from datetime import datetime, timezone

from detection_engine.pipeline.frame_queue import FrameQueue, AnnotatedFrameQueue
from detection_engine.pipeline.detection_worker import DetectionWorker
from detection_engine.camera.frame_writer import ContinuousFrameWriter

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ZonePipeline:
    """
    Complete multi-threaded pipeline for a single camera zone.

    Three-Lane Highway:
    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
    │   Camera    │ ───► │  Detection  │ ───► │   Frame     │
    │  (30 FPS)   │      │  (~10 FPS)  │      │   Writer    │
    └─────────────┘      └─────────────┘      │  (30 FPS)   │
          │                    │              └─────────────┘
          │                    │                    │
          └────────────────────┴────────────────────┘
                         Raw frames also go
                         directly to writer
    """

    def __init__(
        self,
        zone_id: str,
        camera,  # CameraCapture instance
        detector,  # DrowningDetector instance
        pose_estimator,
        behavior_analyzer,
        confidence_filter,
        live_dir: str,
        annotate_frame_fn: Callable,
        detection_callback: Optional[Callable] = None,
        target_fps: int = 30,
    ):
        self.zone_id = zone_id
        self.camera = camera

        # Create queues
        self.raw_frame_queue = FrameQueue(zone_id)
        self.annotated_frame_queue = AnnotatedFrameQueue(zone_id)

        # Create frame writer (Worker 3)
        self.frame_writer = ContinuousFrameWriter(zone_id, live_dir, target_fps)

        # Create detection worker (Worker 2)
        self.detection_worker = DetectionWorker(
            zone_id=zone_id,
            input_queue=self.raw_frame_queue,
            output_queue=self.annotated_frame_queue,
            detector=detector,
            pose_estimator=pose_estimator,
            behavior_analyzer=behavior_analyzer,
            confidence_filter=confidence_filter,
            annotate_frame_fn=annotate_frame_fn,
            detection_callback=detection_callback,
        )

        # Camera feeder thread (Worker 1 bridge)
        self._feeder_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._started = False
        self._last_frame_sequence = -1

    def start(self) -> None:
        """Start all pipeline workers."""
        if self._started:
            logger.warning("[%s] Pipeline already started", self.zone_id)
            return

        self._stop_event.clear()

        # Start frame writer first (Worker 3)
        self.frame_writer.start()

        # Start detection worker (Worker 2)
        self.detection_worker.start()

        # Start camera feeder thread (bridges camera to queues)
        self._feeder_thread = threading.Thread(
            target=self._camera_feeder_loop,
            name=f"camera-feeder-{self.zone_id}",
            daemon=True
        )
        self._feeder_thread.start()

        self._started = True
        logger.info("[%s] Pipeline started (3 workers)", self.zone_id)

    def stop(self) -> None:
        """Stop all pipeline workers."""
        self._stop_event.set()

        # Stop feeder first
        if self._feeder_thread is not None:
            self._feeder_thread.join(timeout=2.0)

        # Stop detection worker
        self.detection_worker.stop()

        # Stop frame writer last
        self.frame_writer.stop()

        self._started = False
        logger.info("[%s] Pipeline stopped", self.zone_id)

    def _camera_feeder_loop(self) -> None:
        """
        Camera feeder loop — bridges camera capture to the pipeline queues.

        This is the "glue" that connects Worker 1 (Camera) to the pipeline:
        - Reads frames from camera at camera FPS
        - Puts raw frames into raw_frame_queue (for detection)
        - Also feeds raw frames to frame_writer (for smooth streaming)
        """
        logger.info("[%s] Camera feeder starting...", self.zone_id)
        frames_fed = 0
        last_log_time = time.time()

        while not self._stop_event.is_set():
            try:
                # Read frame from camera
                frame, metadata = self.camera.read()

                if frame is None:
                    time.sleep(0.01)  # Brief sleep if no frame
                    continue

                # Camera.read() can return the same latest frame between capture
                # updates. Skip duplicate enqueues so drop_rate reflects actual
                # backpressure, not feeder loop speed.
                frame_sequence = metadata.get("frame_sequence")
                if isinstance(frame_sequence, int):
                    if frame_sequence == self._last_frame_sequence:
                        time.sleep(0.001)
                        continue
                    self._last_frame_sequence = frame_sequence

                timestamp = metadata.get("timestamp") or _utc_now_iso()

                # Feed to raw frame queue (for detection worker)
                self.raw_frame_queue.put(frame, timestamp, metadata)

                # Feed raw frame to frame writer (for smooth streaming)
                # This ensures stream never blacks out even when detection is slow
                self.frame_writer.update_raw_frame(frame)

                # Check for annotated frame and feed to writer
                annotated_data = self.annotated_frame_queue.get()
                if annotated_data is not None and annotated_data.annotated_frame is not None:
                    self.frame_writer.update_annotated_frame(annotated_data.annotated_frame)

                frames_fed += 1

                # Log stats every 10 seconds
                now = time.time()
                if now - last_log_time >= 10.0:
                    fps = frames_fed / (now - last_log_time)
                    queue_stats = self.raw_frame_queue.stats
                    logger.debug(
                        "[%s] Feeder: %.1f FPS fed, queue drop_rate=%.1f%%",
                        self.zone_id, fps, queue_stats['drop_rate'] * 100
                    )
                    last_log_time = now
                    frames_fed = 0

            except Exception as exc:
                logger.exception("[%s] Camera feeder error: %s", self.zone_id, exc)
                time.sleep(0.1)

    @property
    def stats(self) -> Dict[str, Any]:
        """Get pipeline statistics."""
        return {
            'zone_id': self.zone_id,
            'is_running': self._started,
            'raw_queue': self.raw_frame_queue.stats,
            'detection': self.detection_worker.stats,
        }


class PipelineManager:
    """
    Manages pipelines for all camera zones.

    Usage:
        manager = PipelineManager(live_dir, annotate_fn, detection_callback)
        manager.create_pipeline(zone_id, camera, detector, ...)
        manager.start_all()
        # ... run detection ...
        manager.stop_all()
    """

    def __init__(
        self,
        live_dir: str,
        annotate_frame_fn: Callable,
        detection_callback: Optional[Callable] = None,
        target_fps: int = 30,
    ):
        self.live_dir = live_dir
        self.annotate_frame_fn = annotate_frame_fn
        self.detection_callback = detection_callback
        self.target_fps = target_fps

        self.pipelines: Dict[str, ZonePipeline] = {}
        self._lock = threading.Lock()

    def create_pipeline(
        self,
        zone_id: str,
        camera,
        detector,
        pose_estimator,
        behavior_analyzer,
        confidence_filter,
    ) -> ZonePipeline:
        """Create a pipeline for a camera zone."""
        with self._lock:
            if zone_id in self.pipelines:
                logger.warning("[%s] Pipeline already exists, returning existing", zone_id)
                return self.pipelines[zone_id]

            pipeline = ZonePipeline(
                zone_id=zone_id,
                camera=camera,
                detector=detector,
                pose_estimator=pose_estimator,
                behavior_analyzer=behavior_analyzer,
                confidence_filter=confidence_filter,
                live_dir=self.live_dir,
                annotate_frame_fn=self.annotate_frame_fn,
                detection_callback=self.detection_callback,
                target_fps=self.target_fps,
            )
            self.pipelines[zone_id] = pipeline
            logger.info("Created pipeline for zone: %s", zone_id)
            return pipeline

    def get_pipeline(self, zone_id: str) -> Optional[ZonePipeline]:
        """Get pipeline for a zone."""
        with self._lock:
            return self.pipelines.get(zone_id)

    def start_all(self) -> None:
        """Start all pipelines."""
        with self._lock:
            for pipeline in self.pipelines.values():
                pipeline.start()
        logger.info("Started %d pipelines", len(self.pipelines))

    def stop_all(self) -> None:
        """Stop all pipelines."""
        with self._lock:
            for pipeline in self.pipelines.values():
                pipeline.stop()
        logger.info("Stopped all pipelines")

    @property
    def stats(self) -> Dict[str, Dict]:
        """Get stats for all pipelines."""
        with self._lock:
            return {
                zone_id: pipeline.stats
                for zone_id, pipeline in self.pipelines.items()
            }
