import pytest
import json
import os
from unittest.mock import patch
from backend.services import clips_service


@pytest.fixture
def mock_clips_service_get(monkeypatch):
    meta = {
        "clip_id": "clip1",
        "clip_file": "clip1.mp4",
        "review": {"status": "pending"}
    }
    monkeypatch.setattr('routes.clips.get_clip_metadata', lambda x: meta if x == "clip1" else None)
    return meta


@pytest.fixture
def mock_clips_service_list(monkeypatch):
    res = {
        "clips": [{"clip_id": "clip1"}],
        "total": 1,
        "page": 1,
        "limit": 20
    }
    monkeypatch.setattr('routes.clips.list_clips', lambda **kwargs: res)
    return res


def test_clips_routes_list_clips_unauth(client):
    res = client.get('/api/v1/clips')
    assert res.status_code == 401


def test_clips_routes_list_clips_auth(client, admin_token, mock_clips_service_list):
    res = client.get('/api/v1/clips', headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.get_json()['data']
    assert data['total'] == 1
    assert data['clips'][0]['clip_id'] == "clip1"


def test_clips_routes_get_clip_metadata_auth(client, admin_token, mock_clips_service_get):
    res = client.get('/api/v1/clips/clip1', headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.get_json()['data']['clip_id'] == "clip1"

    res = client.get('/api/v1/clips/nonexistent', headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 404


def test_clips_routes_patch_clip_unauth(client):
    res = client.patch('/api/v1/clips/clip1/review', json={"outcome": "confirmed"})
    assert res.status_code == 401


def test_clips_routes_patch_clip_invalid(client, admin_token, mock_clips_service_get):
    res = client.patch('/api/v1/clips/clip1/review', json={"outcome": "invalid_outcome"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 400


@patch('routes.clips.update_clip_review')
def test_clips_routes_patch_clip_success(mock_update, client, admin_token):
    mock_update.return_value = {"clip_id": "clip1", "review": {"status": "confirmed"}}
    res = client.patch('/api/v1/clips/clip1/review', json={"outcome": "confirmed", "notes": "test"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.get_json()['data']['review']['status'] == "confirmed"


@patch('routes.clips.get_clip_video_path')
def test_clips_routes_get_video_unauth(mock_get_path, client):
    res = client.get('/api/v1/clips/clip1/video')
    assert res.status_code == 401


@patch('routes.clips.get_clip_video_path')
def test_clips_routes_get_video_auth(mock_get_path, client, admin_token, tmp_path):
    # Create a dummy video file
    video_path = tmp_path / "dummy.mp4"
    video_path.write_bytes(b"dummy_video_data_longer_than_10_bytes")

    mock_get_path.return_value = str(video_path)

    # Test partial content
    headers = {"Authorization": f"Bearer {admin_token}"}
    headers['Range'] = 'bytes=0-5'
    res = client.get('/api/v1/clips/clip1/video', headers=headers)

    assert res.status_code == 206
    assert res.data == b"dummy_"
