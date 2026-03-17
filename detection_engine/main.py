"""AquaGuard detection engine — main entry point.

Loads camera config, initializes one DrowningDetector per zone (CRITICAL),
and runs the continuous detection/alert loop.

Usage:
    python -m detection_engine.main
    # or
    python detection_engine/main.py
"""
import logging
import os
import sys

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aquaguard.main")

# ── Project root on sys.path so imports work regardless of CWD ───────────────
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

# ── Snapshot directory — MUST be absolute (resolved here, passed downstream) ──
_SNAPSHOT_DIR = os.path.join(_BASE_DIR, "backend", "snapshots")
os.makedirs(_SNAPSHOT_DIR, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
_CAMERAS_JSON = os.path.join(_BASE_DIR, "config", "cameras.json")
_MODEL_PATH = os.path.join(_BASE_DIR, "detection_engine", "models", "aquaguard_yolov11s.pt")

from config.settings import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
)


def main():
    from detection_engine.camera.registry import CameraRegistry
    from detection_engine.vision.detector import DrowningDetector
    from detection_engine.vision.pose_estimator import PoseEstimator
    from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
    from detection_engine.analysis.confidence_filter import ConfidenceFilter
    from detection_engine.alert.mqtt_client import MQTTClient
    from detection_engine.alert.api_client import APIClient
    from detection_engine.alert.alert_engine import AlertEngine

    # ── Camera registry ───────────────────────────────────────────────────────
    registry = CameraRegistry()
    registry.load_from_json(_CAMERAS_JSON)

    # ── One DrowningDetector per camera zone (CRITICAL — Rule R6-A) ──────────
    # ByteTrack state must NOT be shared across cameras.
    detectors = {
        zone_id: DrowningDetector(_MODEL_PATH)
        for zone_id in registry.cameras.keys()
    }
    logger.info("Initialized %d DrowningDetector(s)", len(detectors))

    # ── Shared inference components (stateless per-frame; safe to share) ─────
    pose_estimator = PoseEstimator()
    behavior_analyzer = BehaviorAnalyzer()
    confidence_filter = ConfidenceFilter()

    # ── Alert dispatch ────────────────────────────────────────────────────────
    mqtt_client = MQTTClient(MQTT_BROKER_HOST, MQTT_BROKER_PORT)
    api_client = APIClient(
        base_url=os.environ.get("AQUAGUARD_API_URL", "http://localhost:5000"),
        api_key=os.environ.get("AQUAGUARD_API_KEY", ""),
    )
    alert_engine = AlertEngine(mqtt_client, api_client, snapshot_dir=_SNAPSHOT_DIR)

    try:
        mqtt_client.connect()
    except Exception as exc:
        logger.warning("MQTT broker unavailable at startup: %s — continuing without MQTT", exc)

    # ── Start camera threads ──────────────────────────────────────────────────
    registry.start_all()
    logger.info("AquaGuard detection loop starting ...")

    # ── Main detection loop ───────────────────────────────────────────────────
    try:
        while True:
            for zone_id, camera in registry.cameras.items():
                frame, metadata = camera.read()
                if frame is None:
                    continue

                detector = detectors[zone_id]
                detections = detector.detect(frame)

                for det in detections:
                    landmarks = pose_estimator.estimate(frame, det.bbox)
                    if landmarks is None:
                        continue

                    score = behavior_analyzer.analyze(
                        landmarks, det.class_label, det.confidence, det.track_id
                    )

                    if confidence_filter.evaluate(det.track_id, score):
                        alert_engine.dispatch(zone_id, det.track_id, score, frame)

    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received — shutting down ...")
    finally:
        registry.stop_all()
        logger.info("All camera threads stopped. Goodbye.")


if __name__ == "__main__":
    main()
