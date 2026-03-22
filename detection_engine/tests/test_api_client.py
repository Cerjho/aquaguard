"""Unit tests for APIClient backend integration methods."""
from unittest.mock import MagicMock

import pytest
from requests.adapters import HTTPAdapter

from detection_engine.alert.api_client import APIClient


def test_fetch_active_cameras_returns_cameras_list():
    client = APIClient("http://localhost:5000", "test-key")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "cameras": [
            {"zone_id": "zone_01", "rtsp_url": "rtsp://camera-1", "frame_rate": 25},
            {"zone_id": "zone_02", "rtsp_url": 0},
        ]
    }
    client._session.get = MagicMock(return_value=response)

    cameras = client.fetch_active_cameras()

    assert isinstance(cameras, list)
    assert len(cameras) == 2
    assert cameras[0]["zone_id"] == "zone_01"
    client._session.get.assert_called_once()


def test_fetch_active_cameras_raises_on_non_200():
    client = APIClient("http://localhost:5000", "test-key")
    response = MagicMock()
    response.status_code = 401
    response.text = "unauthorized"
    client._session.get = MagicMock(return_value=response)

    with pytest.raises(RuntimeError, match="status 401"):
        client.fetch_active_cameras()


def test_fetch_active_cameras_raises_on_malformed_payload():
    client = APIClient("http://localhost:5000", "test-key")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": []}
    client._session.get = MagicMock(return_value=response)

    with pytest.raises(RuntimeError, match="malformed"):
        client.fetch_active_cameras()


def test_log_event_includes_payload_metadata_fields():
    client = APIClient("http://localhost:5000", "test-key")
    client._session.post = MagicMock(return_value=MagicMock(status_code=201, text="ok"))

    class Payload:
        event_id = "evt-1"
        zone_id = "zone_01"
        track_id = 7
        score = 0.88
        class_label = "drowning"
        yolo_confidence = 0.91
        pose_confidence = 0.72
        final_confidence = 0.88
        snapshot_b64 = "abc"
        timestamp = "2026-01-01T00:00:00Z"

    client.log_event(Payload())
    sent_json = client._session.post.call_args.kwargs["json"]
    assert sent_json["class_label"] == "drowning"
    assert sent_json["yolo_confidence"] == 0.91
    assert sent_json["pose_confidence"] == 0.72
    assert sent_json["final_confidence"] == 0.88


def test_api_client_configures_connection_pooling_adapters():
    client = APIClient("http://localhost:5000", "test-key")

    http_adapter = client._session.adapters["http://"]
    https_adapter = client._session.adapters["https://"]

    assert isinstance(http_adapter, HTTPAdapter)
    assert isinstance(https_adapter, HTTPAdapter)
    assert http_adapter._pool_connections == 10
    assert http_adapter._pool_maxsize == 20
    assert https_adapter._pool_connections == 10
    assert https_adapter._pool_maxsize == 20
