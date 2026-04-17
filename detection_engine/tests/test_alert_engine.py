"""Unit tests for AlertEngine dispatch concurrency behavior."""

from pathlib import Path

import numpy as np

from detection_engine.alert.alert_engine import AlertEngine


class _ImmediateExecutor:
    def __init__(self):
        self.calls = []
        self.shutdown_calls = 0

    def submit(self, fn, *args):
        self.calls.append((fn.__name__, args))
        fn(*args)

    def shutdown(self, wait=False, cancel_futures=True):
        self.shutdown_calls += 1


class _DummyMQTT:
    def __init__(self):
        self.payloads = []

    def publish_alert(self, payload):
        self.payloads.append(payload)


class _DummyAPI:
    def __init__(self):
        self.payloads = []

    def log_event(self, payload):
        self.payloads.append(payload)


def test_dispatch_uses_executor_and_fans_out(monkeypatch, tmp_path):
    executor = _ImmediateExecutor()
    monkeypatch.setattr(
        "detection_engine.alert.alert_engine.ThreadPoolExecutor",
        lambda *args, **kwargs: executor,
    )

    mqtt = _DummyMQTT()
    api = _DummyAPI()
    engine = AlertEngine(mqtt, api, str(tmp_path))

    frame = np.zeros((16, 16, 3), dtype=np.uint8)
    engine.dispatch(
        zone_id="zone_01",
        track_id="trk_1",
        score=0.91,
        frame=frame,
        bbox=(1.0, 2.0, 3.0, 4.0),
    )

    assert len(executor.calls) == 3
    assert len(mqtt.payloads) == 1
    assert len(api.payloads) == 1

    mqtt_payload = mqtt.payloads[0]
    assert mqtt_payload["zone_id"] == "zone_01"
    assert mqtt_payload["bbox"] == [1.0, 2.0, 3.0, 4.0]

    api_payload = api.payloads[0]
    snapshot_path = Path(api_payload.snapshot_path)
    assert snapshot_path.exists()
    assert snapshot_path.parent == tmp_path

    engine.close()


def test_close_is_idempotent(monkeypatch, tmp_path):
    executor = _ImmediateExecutor()
    monkeypatch.setattr(
        "detection_engine.alert.alert_engine.ThreadPoolExecutor",
        lambda *args, **kwargs: executor,
    )

    engine = AlertEngine(_DummyMQTT(), _DummyAPI(), str(tmp_path))
    engine.close()
    engine.close()

    assert executor.shutdown_calls == 1


def test_pipeline_compat_methods_dispatch_alert(monkeypatch, tmp_path):
    executor = _ImmediateExecutor()
    monkeypatch.setattr(
        "detection_engine.alert.alert_engine.ThreadPoolExecutor",
        lambda *args, **kwargs: executor,
    )

    mqtt = _DummyMQTT()
    api = _DummyAPI()
    engine = AlertEngine(mqtt, api, str(tmp_path))

    frame = np.zeros((8, 8, 3), dtype=np.uint8)
    assert engine.should_trigger_alert("zone_a", "track_1", 0.92) is True

    engine.dispatch_alert(
        zone_id="zone_a",
        track_id="track_1",
        frame=frame,
        bbox=(0.0, 0.0, 1.0, 1.0),
        class_label="drowning",
        yolo_confidence=0.9,
        final_confidence=0.92,
    )

    assert len(mqtt.payloads) == 1
    assert len(api.payloads) == 1
    assert mqtt.payloads[0]["track_id"] == "track_1"

    engine.close()
