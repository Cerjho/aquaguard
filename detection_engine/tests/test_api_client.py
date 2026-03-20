"""Unit tests for APIClient backend integration methods."""
from unittest.mock import MagicMock

import pytest

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
