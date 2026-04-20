"""Tests for live annotated output and heartbeat behavior in detection_engine.main."""
import json
import os

import cv2
import numpy as np

from detection_engine.main import (
    _annotate_live_frame,
    _connect_mqtt_with_retries,
    _get_required_api_url,
    _load_api_env_from_backend_env,
    _send_zone_heartbeat_if_due,
    _write_live_zone_artifacts,
)
from detection_engine.models_data.detection import Detection


def test_annotate_live_frame_draws_overlay(blank_frame):
    detections = [
        Detection(
            track_id="1",
            class_label="drowning",
            confidence=0.93,
            bbox=(50.0, 50.0, 180.0, 220.0),
        )
    ]
    annotated = _annotate_live_frame(blank_frame, detections, "zone_test", "2026-01-01T00:00:00Z")
    assert annotated.shape == blank_frame.shape
    # Overlay should change pixel data compared to all-black source.
    assert np.any(annotated != blank_frame)


def test_write_live_zone_artifacts_writes_latest_jpg_and_status_json(tmp_path):
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    status_payload = {
        "component": "detection_engine",
        "zone_id": "zone_test",
        "status": "online",
        "heartbeat_source": "annotated_feed",
        "feed_mode": "annotated_snapshot_mjpeg",
    }

    _write_live_zone_artifacts(str(tmp_path), "zone_test", frame, status_payload)

    latest_jpg = tmp_path / "zone_test_latest.jpg"
    latest_json = tmp_path / "zone_test_status.json"
    engine_json = tmp_path / "detection_engine_status.json"
    assert latest_jpg.exists()
    assert latest_json.exists()
    assert engine_json.exists()

    decoded = cv2.imread(str(latest_jpg))
    assert decoded is not None and decoded.shape == frame.shape

    payload = json.loads(latest_json.read_text(encoding="utf-8"))
    assert payload["zone_id"] == "zone_test"
    assert payload["heartbeat_source"] == "annotated_feed"
    engine_payload = json.loads(engine_json.read_text(encoding="utf-8"))
    assert engine_payload["component"] == "detection_engine"
    assert engine_payload["status"] == "online"


def test_send_zone_heartbeat_if_due_respects_interval():
    published = []

    class _FakeMQTT:
        def publish_detection(self, payload):
            published.append(payload)

    mqtt = _FakeMQTT()
    tracker = {}

    sent_first = _send_zone_heartbeat_if_due(mqtt, "zone_test", 2, 100.0, tracker)
    sent_second = _send_zone_heartbeat_if_due(mqtt, "zone_test", 2, 101.0, tracker)
    sent_third = _send_zone_heartbeat_if_due(mqtt, "zone_test", 3, 106.5, tracker)

    assert sent_first is True
    assert sent_second is False
    assert sent_third is True
    assert len(published) == 2
    assert all(item["message_type"] == "heartbeat" for item in published)


def test_load_api_env_from_backend_env_loads_missing_values(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AQUAGUARD_API_URL=http://localhost:5000\nAQUAGUARD_API_KEY=dev-key\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("AQUAGUARD_API_URL", raising=False)
    monkeypatch.delenv("AQUAGUARD_API_KEY", raising=False)
    monkeypatch.setattr("detection_engine.main._BACKEND_ENV_PATH", str(env_file))

    _load_api_env_from_backend_env()

    assert os.environ.get("AQUAGUARD_API_URL") == "http://localhost:5000"
    assert os.environ.get("AQUAGUARD_API_KEY") == "dev-key"


def test_load_api_env_from_backend_env_does_not_override_shell_values(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AQUAGUARD_API_URL=http://from-env-file:5000\nAQUAGUARD_API_KEY=file-key\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AQUAGUARD_API_URL", "http://from-shell:5000")
    monkeypatch.setenv("AQUAGUARD_API_KEY", "shell-key")
    monkeypatch.setattr("detection_engine.main._BACKEND_ENV_PATH", str(env_file))

    _load_api_env_from_backend_env()

    assert os.environ.get("AQUAGUARD_API_URL") == "http://from-shell:5000"
    assert os.environ.get("AQUAGUARD_API_KEY") == "shell-key"


def test_get_required_api_url_raises_when_missing(monkeypatch):
    monkeypatch.delenv("AQUAGUARD_API_URL", raising=False)
    monkeypatch.delenv("API_BASE_URL", raising=False)
    try:
        _get_required_api_url()
        assert False, "Expected RuntimeError when AQUAGUARD_API_URL is missing"
    except RuntimeError as exc:
        assert "Missing AQUAGUARD_API_URL" in str(exc)


def test_get_required_api_url_uses_legacy_api_base_url(monkeypatch):
    monkeypatch.delenv("AQUAGUARD_API_URL", raising=False)
    monkeypatch.setenv("API_BASE_URL", "http://legacy-backend:5000")

    resolved = _get_required_api_url()

    assert resolved == "http://legacy-backend:5000"
    assert os.environ.get("AQUAGUARD_API_URL") == "http://legacy-backend:5000"


def test_connect_mqtt_with_retries_succeeds_after_transient_failures(monkeypatch):
    attempts = {"count": 0}
    sleeps = []

    class _FlakyMQTT:
        def connect(self):
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise OSError("connection refused")

    monkeypatch.setattr(
        "detection_engine.main.MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS",
        [1, 2, 4],
    )
    monkeypatch.setattr("detection_engine.main.time.sleep", lambda delay: sleeps.append(delay))

    assert _connect_mqtt_with_retries(_FlakyMQTT()) is True
    assert attempts["count"] == 3
    assert sleeps == [1, 2]


def test_connect_mqtt_with_retries_returns_false_after_exhausting_attempts(monkeypatch):
    sleeps = []

    class _DownMQTT:
        def connect(self):
            raise OSError("broker down")

    monkeypatch.setattr(
        "detection_engine.main.MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS",
        [1, 2],
    )
    monkeypatch.setattr("detection_engine.main.time.sleep", lambda delay: sleeps.append(delay))

    assert _connect_mqtt_with_retries(_DownMQTT()) is False
    assert sleeps == [1, 2]
