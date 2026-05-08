"""
Pipeline Manager — Orchestrates the Three-Lane Highway architecture.

Manages all workers for each camera zone:
1. Camera Capture (Worker 1) — already exists in CameraCapture class
2. Detection Worker (Worker 2) — runs YOLO in separate thread
3. Dashboard Ring Buffer — in-memory circular buffer for live streaming

Stream lane separation (P0-Task 3):
  After decoding a frame ONCE from RTSP, the same frame reference is
  passed to BOTH consumers:
  - Detection branch: priority_queue.put(frame) — subject to backpressure
  - Dashboard branch: dashboard_buffer.write(frame) — always runs, never throttled
  No second RTSP connection.  No frame copy.  No shared locks between branches.
"""
import logging
import threading
import time
from typing import Dict, Optional, Callable, Any
from datetime import datetime, timezone

from detection_engine.pipeline.frame_queue import (
    FrameQueue,
    AnnotatedFrameQueue,
)
from detection_engine.pipeline.detection_worker import DetectionWorker
from detection_engine.pipeline.dashboard_buffer import DashboardRingBuffer
from detection_engine.camera.frame_writer import ContinuousFrameWriter

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ZonePipeline:
    """
    Complete multi-threaded pipeline for a single camera zone.

    Stream Lane Separation (P0-Task 3):
    ┌─────────────┐      ┌─────────────┐
    │   Camera    │ ───► │  Detection  │
    │  (30 FPS)   │      │  (~10 FPS)  │
    └─────────────┘      └─────────────┘
          │                    │
          │  ┌─────────────────┘
          │  │
          ▼  ▼
    ┌─────────────┐      ┌─────────────┐
    │  Priority   │      │  Dashboard  │
    │  Frame Q    │      │  Ring Buf   │
    │ (detection) │      │ (streaming) │
    └─────────────┘      └─────────────┘
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
        gpu_memory_manager=None,
        mqtt_client=None,
    ):
        self.zone_id = zone_id
        self.camera = camera
        self.annotate_frame_fn = annotate_frame_fn
        self.latest_detections = []

        # Create queues
        self.raw_frame_queue = FrameQueue(zone_id)
        self.annotated_frame_queue = AnnotatedFrameQueue(zone_id)

        # Dashboard ring buffer (P0-Task 3: stream lane separation)
        self.dashboard_buffer = DashboardRingBuffer(zone_id)

        # Create frame writer (Worker 3) — kept for backward compatibility
        # TODO(out-of-scope): Remove ContinuousFrameWriter in Phase 1 Task 6
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
            gpu_memory_manager=gpu_memory_manager,
            mqtt_client=mqtt_client,
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

        # Start frame writer first (Worker 3) — backward compat
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
        logger.info("[%s] Pipeline started (detection + dashboard streams)", self.zone_id)

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
        Camera feeder loop — bridges camera capture to the pipeline.

        Stream Lane Separation (P0-Task 3):
        After decoding a frame ONCE, the SAME frame reference goes to both:
        1. Detection branch: priority_queue.put(frame) — backpressure-aware
        2. Dashboard branch: dashboard_buffer.write(frame) — always runs

        The dashboard branch does NOT acquire any lock held by the
        detection branch.  No frame copy.  No second RTSP connection.
        """
        logger.info("[%s] Camera feeder starting...", self.zone_id)
        frames_fed = 0
        last_log_time = time.time()

        while not self._stop_event.is_set():
            try:
                # Read frame from camera (decoded ONCE)
                frame, metadata = self.camera.read()

                if frame is None:
                    time.sleep(0.01)  # Brief sleep if no frame
                    continue

                # Skip duplicate frames (same sequence number)
                frame_sequence = metadata.get("frame_sequence")
                if isinstance(frame_sequence, int):
                    if frame_sequence == self._last_frame_sequence:
                        time.sleep(0.001)
                        continue
                    self._last_frame_sequence = frame_sequence

                timestamp = metadata.get("timestamp") or _utc_now_iso()

                # ── BRANCH 1: Detection path (backpressure-aware) ────────
                # Frame reference goes into priority queue — may be dropped
                # by the queue's priority policies.
                self.raw_frame_queue.put(frame, timestamp, metadata)

                # ── BRANCH 2: Dashboard path (always runs, never throttled) ──
                # Same frame reference — NO copy.  Dashboard buffer uses its
                # own write lock, independent of the detection queue lock.
                self.dashboard_buffer.write(frame, time.monotonic())

                # Drain annotated frame to update latest detections overlay
                annotated_data = self.annotated_frame_queue.get()
                if (
                    annotated_data is not None
                    and getattr(annotated_data, 'detections', None) is not None
                ):
                    self.latest_detections = annotated_data.detections

                # Overlay the latest known detections onto the fresh raw frame
                # for the legacy frame writer (backward compat — removed in P1)
                frame_out = frame.copy()
                if self.latest_detections:
                    frame_out = self.annotate_frame_fn(
                        frame_out, self.latest_detections,
                        self.zone_id, timestamp,
                    )

                # Feed the composited frame to legacy frame writer
                self.frame_writer.update_raw_frame(frame_out)

                frames_fed += 1

                # Log stats every 10 seconds
                now = time.time()
                if now - last_log_time >= 10.0:
                    fps = frames_fed / (now - last_log_time)
                    queue_stats = self.raw_frame_queue.stats
                    logger.debug(
                        "[%s] Feeder: %.1f FPS, queue depth=%.0f%%, "
                        "dashboard_buf writes=%d",
                        self.zone_id, fps,
                        queue_stats.get('queue_depth', 0) * 100,
                        self.dashboard_buffer.total_writes,
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
            'dashboard_buffer_writes': self.dashboard_buffer.total_writes,
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
        gpu_memory_manager=None,
        mqtt_client=None,
    ):
        self.live_dir = live_dir
        self.annotate_frame_fn = annotate_frame_fn
        self.detection_callback = detection_callback
        self.target_fps = target_fps
        self.gpu_memory_manager = gpu_memory_manager
        self.mqtt_client = mqtt_client

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
                gpu_memory_manager=self.gpu_memory_manager,
                mqtt_client=self.mqtt_client,
            )
            self.pipelines[zone_id] = pipeline
            logger.info("Created pipeline for zone: %s", zone_id)
            return pipeline

    def get_pipeline(self, zone_id: str) -> Optional[ZonePipeline]:
        """Get pipeline for a zone."""
        with self._lock:
            return self.pipelines.get(zone_id)

    def get_dashboard_buffer(self, zone_id: str) -> Optional[DashboardRingBuffer]:
        """Get dashboard ring buffer for a zone."""
        with self._lock:
            pipeline = self.pipelines.get(zone_id)
            if pipeline is not None:
                return pipeline.dashboard_buffer
            return None

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
