"""Test harness to run a real-ish detection flow locally.

Usage:
    python scripts/test_detection_flow.py --source 0 --duration 30
    python scripts/test_detection_flow.py --source /path/to/video.mp4 --duration 20

The script builds a single three-lane pipeline (Camera -> Detection -> FrameWriter)
using lightweight mock components where real hardware or network services
are not available. Use `--real-detector` to attempt to load the real model
if you have the weights and dependencies installed.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import logging
from typing import List

# Ensure project root on path
_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import cv2

from detection_engine.camera.capture import CameraCapture
from detection_engine.pipeline.pipeline_manager import PipelineManager
from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
from detection_engine.analysis.confidence_filter import ConfidenceFilter
from detection_engine.models_data.detection import Detection
from detection_engine.models_data.landmark import Landmark

LOG = logging.getLogger("test_detection_flow")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class MockDetector:
    """Simple deterministic detector that emits a single drowning detection every frame."""

    def __init__(self):
        self._counter = 0

    def detect(self, frame) -> List[Detection]:
        h, w = frame.shape[:2]
        # Single detection centered in frame
        bbox = (w * 0.3, h * 0.2, w * 0.7, h * 0.9)
        det = Detection(track_id="1", class_label="drowning", confidence=0.9, bbox=bbox)
        return [det]


class MockPoseEstimator:
    """Provides static synthetic landmarks that trigger drowning indicators.

    The landmarks are normalized (0.0-1.0) and arranged so that:
    - shoulders are around y=0.5, hips y=0.8 (vertical body)
    - wrists above shoulders (arms elevated)
    - nose at shoulder level (head_low)
    """

    def predict_frame(self, frame):
        # Return a trivial placeholder used by estimate_from_results
        return {"frame_shape": frame.shape}

    def estimate_from_results(self, pose_results, bbox):
        # Create 33 landmarks with values tuned to satisfy analyzer checks
        lm: List[Landmark] = []
        # convenience values
        shoulder_y = 0.5
        hip_y = 0.8
        nose_y = shoulder_y
        # create 33 landmarks
        for i in range(33):
            x = 0.5
            y = hip_y
            z = 0.0
            vis = 0.0
            # Set specific indices
            if i == 0:  # nose
                y = nose_y
                vis = 0.99
            elif i in (11, 12):  # shoulders
                y = shoulder_y
                vis = 0.99
            elif i in (23, 24):  # hips
                y = hip_y
                vis = 0.99
            elif i in (15, 16):  # wrists (above shoulders)
                y = shoulder_y - 0.15
                vis = 0.99
            elif i in (27, 28):  # ankles (low visibility to avoid ankle gate)
                y = hip_y + 0.05
                vis = 0.1
            lm.append(Landmark(x=x, y=float(y), z=float(z), visibility=float(vis)))

        return lm


class MockMQTTClient:
    def publish_detection(self, payload):
        LOG.info("MOCK MQTT publish_detection: %s", payload)

    def publish_camera_health(self, zone_id, status, reason=None, metrics=None):
        LOG.info("MOCK MQTT camera_health zone=%s status=%s", zone_id, status)

    def publish_alert(self, payload):
        LOG.info("MOCK MQTT publish_alert: %s", payload)

    def close(self):
        LOG.info("MOCK MQTT closed")


class MockAPIClient:
    def log_event(self, payload):
        LOG.info("MOCK API log_event: %s", payload.__dict__)


def make_rtsp_source_arg(src: str) -> object:
    # Accept numeric webcam indices or file paths; CameraCapture accepts both.
    if src.isdigit():
        return int(src)
    if os.path.exists(src):
        # Convert to file:// absolute URL so validate_rtsp_url accepts it
        return f"file://{os.path.abspath(src)}"
    return src


def main():
    parser = argparse.ArgumentParser(description="Run a local detection flow test")
    parser.add_argument("--source", default="0", help="Camera source: webcam index or video file path")
    parser.add_argument("--duration", type=int, default=20, help="Seconds to run the test")
    parser.add_argument("--real-detector", action="store_true", help="Attempt to load real YOLO detector (optional)")
    args = parser.parse_args()

    source = make_rtsp_source_arg(args.source)

    zone_id = "test_zone"
    camera = CameraCapture(zone_id, source, frame_rate=15)

    # Prepare components (use mocks for connectivity)
    detector = MockDetector()
    pose_estimator = MockPoseEstimator()
    behavior_analyzer = BehaviorAnalyzer()
    confidence_filter = ConfidenceFilter()

    # Snapshot dir
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    snapshot_dir = os.path.join(project_root, "backend", "snapshots")
    os.makedirs(snapshot_dir, exist_ok=True)

    mqtt_client = MockMQTTClient()
    api_client = MockAPIClient()

    # Minimal annotate function (reuse main's style)
    def annotate_fn(frame, detections, zid, ts):
        out = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = [int(v) for v in det.bbox]
            color = (0, 0, 255) if det.class_label == "drowning" else (0, 255, 255)
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        return out

    # Build the pipeline manager
    manager = PipelineManager(live_dir=os.path.join(snapshot_dir, "live"), annotate_frame_fn=annotate_fn)

    # Create pipeline
    pipeline = manager.create_pipeline(
        zone_id=zone_id,
        camera=camera,
        detector=detector,
        pose_estimator=pose_estimator,
        behavior_analyzer=behavior_analyzer,
        confidence_filter=confidence_filter,
    )

    try:
        LOG.info("Starting camera and pipeline...")
        camera.start()
        manager.start_all()

        start = time.time()
        while time.time() - start < args.duration:
            time.sleep(0.5)
            stats = manager.stats.get(zone_id, {})
            LOG.info("Pipeline stats: %s", stats)

    except KeyboardInterrupt:
        LOG.info("Interrupted by user")
    finally:
        LOG.info("Stopping pipeline and camera")
        manager.stop_all()
        camera.stop()


if __name__ == "__main__":
    main()
