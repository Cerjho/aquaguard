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
import json
import time
from datetime import datetime, timezone
import cv2

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
    DETECTION_ENGINE_HEARTBEAT_INTERVAL_SECONDS,
    LIVE_SNAPSHOT_JPEG_QUALITY,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _annotate_live_frame(frame, detections, zone_id: str, frame_timestamp: str):
    """Return a copy of frame annotated with detection overlays and status text."""
    annotated = frame.copy()
    for det in detections:
        x1, y1, x2, y2 = [int(v) for v in det.bbox]
        color = (0, 0, 255) if det.class_label == "drowning" else (0, 255, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{det.class_label} {det.confidence:.2f} id:{det.track_id}"
        cv2.putText(
            annotated,
            label,
            (max(5, x1), max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
            cv2.LINE_AA,
        )

    footer = f"AquaGuard | {zone_id} | detections={len(detections)} | {frame_timestamp}"
    cv2.putText(
        annotated,
        footer,
        (10, max(30, annotated.shape[0] - 12)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return annotated


def _atomic_write_jpeg(path: str, frame) -> None:
    """Safely write JPEG via temp file then atomic replace."""
    tmp_path = f"{path}.tmp"
    ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, LIVE_SNAPSHOT_JPEG_QUALITY])
    if not ok:
        raise OSError(f"Failed to encode JPEG for {path}")
    with open(tmp_path, "wb") as fh:
        fh.write(encoded.tobytes())
    os.replace(tmp_path, path)


def _atomic_write_json(path: str, payload: dict) -> None:
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    os.replace(tmp_path, path)


def _write_live_zone_artifacts(live_dir: str, zone_id: str, annotated_frame, status_payload: dict) -> None:
    """Update both zone latest annotated JPEG and status metadata JSON."""
    latest_jpg_path = os.path.join(live_dir, f"{zone_id}_latest.jpg")
    latest_status_path = os.path.join(live_dir, f"{zone_id}_status.json")
    engine_status_path = os.path.join(live_dir, "detection_engine_status.json")
    _atomic_write_jpeg(latest_jpg_path, annotated_frame)
    _atomic_write_json(latest_status_path, status_payload)
    _atomic_write_json(
        engine_status_path,
        {
            "component": "detection_engine",
            "status": "online",
            "heartbeat_source": status_payload.get("heartbeat_source", "annotated_feed"),
            "feed_mode": status_payload.get("feed_mode", "annotated_snapshot_mjpeg"),
            "last_zone_id": zone_id,
            "updated_at": status_payload.get("updated_at", _utc_now_iso()),
        },
    )


def _send_zone_heartbeat_if_due(
    mqtt_client,
    zone_id: str,
    detection_count: int,
    now_epoch_s: float,
    last_heartbeat_at: dict,
) -> bool:
    """Send per-zone heartbeat on MQTT if interval elapsed."""
    previous = last_heartbeat_at.get(zone_id, 0.0)
    if (now_epoch_s - previous) < DETECTION_ENGINE_HEARTBEAT_INTERVAL_SECONDS:
        return False

    heartbeat_payload = {
        "message_type": "heartbeat",
        "component": "detection_engine",
        "zone_id": zone_id,
        "status": "online",
        "heartbeat_source": "annotated_feed",
        "feed_mode": "annotated_snapshot_mjpeg",
        "feed_status": "online",
        "detection_count": detection_count,
        "timestamp": _utc_now_iso(),
    }
    mqtt_client.publish_detection(heartbeat_payload)
    last_heartbeat_at[zone_id] = now_epoch_s
    return True


def main():
    from detection_engine.camera.registry import CameraRegistry
    from detection_engine.vision.detector import DrowningDetector
    from detection_engine.vision.pose_estimator import PoseEstimator
    from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
    from detection_engine.analysis.confidence_filter import ConfidenceFilter
    from detection_engine.alert.mqtt_client import MQTTClient
    from detection_engine.alert.api_client import APIClient
    from detection_engine.alert.alert_engine import AlertEngine

    _LIVE_DIR = os.path.join(_BASE_DIR, "backend", "snapshots", "live")
    os.makedirs(_LIVE_DIR, exist_ok=True)

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

    # ── Per-zone stateful analyzers/filters (prevents cross-zone track collisions)
    pose_estimator = PoseEstimator()
    behavior_analyzers = {
        zone_id: BehaviorAnalyzer()
        for zone_id in registry.cameras.keys()
    }
    confidence_filters = {
        zone_id: ConfidenceFilter()
        for zone_id in registry.cameras.keys()
    }

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
    last_heartbeat_at = {}
    try:
        while True:
            for zone_id, camera in registry.cameras.items():
                try:
                    frame, metadata = camera.read()
                    if frame is None:
                        continue

                    detector = detectors[zone_id]
                    detections = detector.detect(frame)
                    logger.debug("Zone %s: %d detections", zone_id, len(detections))
                    if not detections:
                        logger.info("Zone %s: no tracked detections on this frame", zone_id)
                    if detections:
                        logger.debug(
                            "Zone %s raw detections: %s",
                            zone_id,
                            [
                                {
                                    "track_id": det.track_id,
                                    "class_label": det.class_label,
                                    "confidence": round(float(det.confidence), 4),
                                }
                                for det in detections
                            ],
                        )

                    frame_timestamp = metadata.get("timestamp") or _utc_now_iso()
                    status_payload = {
                        "component": "detection_engine",
                        "zone_id": zone_id,
                        "status": "online",
                        "heartbeat_source": "annotated_feed",
                        "feed_mode": "annotated_snapshot_mjpeg",
                        "feed_status": "online",
                        "detection_count": len(detections),
                        "latest_frame_at": frame_timestamp,
                        "updated_at": _utc_now_iso(),
                    }
                    try:
                        annotated = _annotate_live_frame(frame, detections, zone_id, frame_timestamp)
                        _write_live_zone_artifacts(_LIVE_DIR, zone_id, annotated, status_payload)
                    except Exception as artifact_exc:
                        logger.warning(
                            "Live artifact update failed for zone %s: %s", zone_id, artifact_exc
                        )

                    now_ts = time.time()
                    try:
                        _send_zone_heartbeat_if_due(
                            mqtt_client=mqtt_client,
                            zone_id=zone_id,
                            detection_count=len(detections),
                            now_epoch_s=now_ts,
                            last_heartbeat_at=last_heartbeat_at,
                        )
                    except Exception as hb_exc:
                        logger.warning("Heartbeat publish failed for zone %s: %s", zone_id, hb_exc)

                    for det in detections:
                        landmarks = pose_estimator.estimate(frame, det.bbox)
                        if landmarks is None:
                            logger.info(
                                "Zone %s track %s: pose estimation failed (no landmarks)",
                                zone_id,
                                det.track_id,
                            )
                            continue

                        score = behavior_analyzers[zone_id].analyze(
                            landmarks, det.class_label, det.confidence, det.track_id
                        )

                        should_alert = confidence_filters[zone_id].evaluate(det.track_id, score)
                        logger.info(
                            "Zone %s track %s: class=%s yolo=%.3f score=%.3f alert=%s",
                            zone_id,
                            det.track_id,
                            det.class_label,
                            float(det.confidence),
                            float(score),
                            should_alert,
                        )
                        if should_alert:
                            alert_engine.dispatch(zone_id, det.track_id, score, frame)
                            logger.info(
                                "Zone %s track %s: alert dispatched",
                                zone_id,
                                det.track_id,
                            )
                except Exception as exc:
                    logger.exception("Processing error in zone %s: %s", zone_id, exc)
                    continue

    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received — shutting down ...")
    finally:
        registry.stop_all()
        logger.info("All camera threads stopped. Goodbye.")


if __name__ == "__main__":
    main()
