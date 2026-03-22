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
import json
import time
from datetime import datetime, timezone
import cv2
try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - exercised in CI envs without python-dotenv
    load_dotenv = None

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aquaguard.main")

# ── Base directories ──────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Snapshot directory — MUST be absolute (resolved here, passed downstream) ──
_SNAPSHOT_DIR = os.path.join(_BASE_DIR, "backend", "snapshots")
os.makedirs(_SNAPSHOT_DIR, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
_MODEL_PATH = os.path.join(_BASE_DIR, "detection_engine", "models", "aquaguard_yolov11s.pt")
_BACKEND_ENV_PATH = os.path.join(_BASE_DIR, "backend", ".env")

from config.settings import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    DETECTION_ENGINE_HEARTBEAT_INTERVAL_SECONDS,
    LIVE_SNAPSHOT_JPEG_QUALITY,
    LIVE_ARTIFACT_REPLACE_RETRIES,
    LIVE_ARTIFACT_RETRY_DELAY_SECONDS,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_api_env_from_backend_env() -> None:
    """Load backend/.env for local dev without overriding existing shell env."""
    pre_url = os.environ.get("AQUAGUARD_API_URL")
    pre_key = os.environ.get("AQUAGUARD_API_KEY")

    if pre_url and pre_key:
        logger.info("API config source: shell environment (AQUAGUARD_API_URL + AQUAGUARD_API_KEY)")
        return

    if os.path.exists(_BACKEND_ENV_PATH):
        if load_dotenv is not None:
            load_dotenv(_BACKEND_ENV_PATH, override=False)
        else:
            with open(_BACKEND_ENV_PATH, "r", encoding="utf-8") as env_file:
                for line in env_file:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        post_url = os.environ.get("AQUAGUARD_API_URL")
        post_key = os.environ.get("AQUAGUARD_API_KEY")
        if (not pre_url and post_url) or (not pre_key and post_key):
            logger.info("API config source: loaded missing values from %s", _BACKEND_ENV_PATH)
        else:
            logger.info("API config source: backend .env checked at %s", _BACKEND_ENV_PATH)
    else:
        logger.info("API config source: backend .env not found at %s", _BACKEND_ENV_PATH)


def _get_required_api_url() -> str:
    api_url = os.environ.get("AQUAGUARD_API_URL", "").strip()
    if not api_url:
        logger.error(
            "AQUAGUARD_API_URL is missing. Set it in shell env or backend/.env "
            "before starting detection_engine.main"
        )
        raise RuntimeError("Missing AQUAGUARD_API_URL for backend internal API")
    return api_url


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
    """Safely write JPEG via temp file then atomic replace.

    On Windows, readers can briefly lock the destination file while streaming.
    Retry replace with short backoff to avoid noisy transient failures.
    """
    tmp_path = f"{path}.{os.getpid()}.tmp"
    ok, encoded = cv2.imencode(
        ".jpg",
        frame,
        [cv2.IMWRITE_JPEG_QUALITY, LIVE_SNAPSHOT_JPEG_QUALITY],
    )
    if not ok:
        raise OSError(f"Failed to encode JPEG for {path}")
    with open(tmp_path, "wb") as fh:
        fh.write(encoded.tobytes())

    retries = max(int(LIVE_ARTIFACT_REPLACE_RETRIES), 1)
    try:
        for attempt in range(retries):
            try:
                os.replace(tmp_path, path)
                return
            except PermissionError:
                if attempt == retries - 1:
                    raise
                sleep_s = max(float(LIVE_ARTIFACT_RETRY_DELAY_SECONDS), 0.0) * (attempt + 1)
                if sleep_s > 0:
                    time.sleep(sleep_s)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError as cleanup_exc:
                logger.debug(
                    "Temporary live artifact cleanup failed for %s: %s",
                    tmp_path,
                    cleanup_exc,
                )


def _atomic_write_json(path: str, payload: dict) -> None:
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    os.replace(tmp_path, path)


def _write_live_zone_artifacts(
    live_dir: str,
    zone_id: str,
    annotated_frame,
    status_payload: dict,
) -> None:
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


def _process_zone_frame(
    *,
    zone_id: str,
    camera,
    detector,
    pose_estimator,
    behavior_analyzer,
    confidence_filter,
    alert_engine,
    mqtt_client,
    live_dir: str,
    last_heartbeat_at: dict,
) -> None:
    frame, metadata = camera.read()
    if frame is None:
        return

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
    active_track_ids = {str(det.track_id) for det in detections}

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
        _write_live_zone_artifacts(live_dir, zone_id, annotated, status_payload)
    except (OSError, ValueError) as artifact_exc:
        logger.warning("Live artifact update failed for zone %s: %s", zone_id, artifact_exc)

    now_ts = time.time()
    try:
        _send_zone_heartbeat_if_due(
            mqtt_client=mqtt_client,
            zone_id=zone_id,
            detection_count=len(detections),
            now_epoch_s=now_ts,
            last_heartbeat_at=last_heartbeat_at,
        )
    except (OSError, RuntimeError, ValueError) as hb_exc:
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

        score = behavior_analyzer.analyze(
            landmarks,
            det.class_label,
            det.confidence,
            det.track_id,
        )

        should_alert = confidence_filter.evaluate(det.track_id, score)
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
            alert_engine.dispatch(
                zone_id=zone_id,
                track_id=det.track_id,
                score=score,
                frame=frame,
                bbox=det.bbox,
                class_label=det.class_label,
                yolo_confidence=float(det.confidence),
                pose_confidence=None,
                final_confidence=float(score),
            )
            logger.info("Zone %s track %s: alert dispatched", zone_id, det.track_id)

    behavior_analyzer.cleanup_stale_tracks(active_track_ids)
    confidence_filter.cleanup_stale_tracks(active_track_ids)


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

    # ── API client and backend camera source of truth ────────────────────────
    _load_api_env_from_backend_env()
    api_key = os.environ.get("AQUAGUARD_API_KEY", "").strip()
    if not api_key:
        logger.error(
            "AQUAGUARD_API_KEY is missing. Set it in shell env or backend/.env "
            "before starting detection_engine.main"
        )
        raise RuntimeError("Missing AQUAGUARD_API_KEY for backend internal API authentication")

    api_client = APIClient(
        base_url=_get_required_api_url(),
        api_key=api_key,
    )
    cameras = api_client.fetch_active_cameras()
    if not cameras:
        logger.error("Backend returned no active cameras; detection engine cannot start")
        raise RuntimeError("No active cameras from backend internal endpoint")

    # ── Camera registry ───────────────────────────────────────────────────────
    registry = CameraRegistry()
    registry.load_from_backend(cameras)

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
    alert_engine = AlertEngine(mqtt_client, api_client, snapshot_dir=_SNAPSHOT_DIR)

    try:
        mqtt_client.connect()
    except (OSError, RuntimeError, ValueError) as exc:
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
                    _process_zone_frame(
                        zone_id=zone_id,
                        camera=camera,
                        detector=detectors[zone_id],
                        pose_estimator=pose_estimator,
                        behavior_analyzer=behavior_analyzers[zone_id],
                        confidence_filter=confidence_filters[zone_id],
                        alert_engine=alert_engine,
                        mqtt_client=mqtt_client,
                        live_dir=_LIVE_DIR,
                        last_heartbeat_at=last_heartbeat_at,
                    )
                except Exception as exc:
                    logger.exception("Processing error in zone %s: %s", zone_id, exc)
                    continue

    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received — shutting down ...")
    finally:
        registry.stop_all()
        try:
            mqtt_client.close()
        except (OSError, RuntimeError, ValueError) as exc:
            logger.warning("MQTT shutdown encountered an error: %s", exc)
        logger.info("All camera threads stopped. Goodbye.")


if __name__ == "__main__":
    main()
