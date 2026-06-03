import os
import json
import uuid
import pytest
from backend.services.clips_service import list_clips, get_clip_metadata, get_clip_video_path, update_clip_review


@pytest.fixture
def mock_clips_workspace(tmp_path, monkeypatch):
    clips_dir = str(tmp_path / "clips")
    os.makedirs(clips_dir, exist_ok=True)
    monkeypatch.setattr('backend.services.clips_service._CLIPS_DIR', clips_dir)
    return clips_dir


def _create_mock_clip(clips_dir, status, clip_id, zone_id, created_at):
    folder = os.path.join(clips_dir, status, zone_id)
    os.makedirs(folder, exist_ok=True)

    json_path = os.path.join(folder, f"{clip_id}.json")
    mp4_path = os.path.join(folder, f"{clip_id}.mp4")

    meta = {
        "clip_id": clip_id,
        "zone_id": zone_id,
        "created_at": created_at,
        "clip_file": f"{clip_id}.mp4",
        "review": {"status": "pending"}
    }

    with open(json_path, 'w') as f:
        json.dump(meta, f)

    with open(mp4_path, 'w') as f:
        f.write("video content")

    return json_path, mp4_path


def test_clips_service_list_clips(mock_clips_workspace):
    _create_mock_clip(mock_clips_workspace, "pending", "clip1", "zone1", "2026-05-01T00:00:00Z")
    _create_mock_clip(mock_clips_workspace, "pending", "clip2", "zone2", "2026-05-02T00:00:00Z")
    _create_mock_clip(mock_clips_workspace, "confirmed", "clip3", "zone1", "2026-05-03T00:00:00Z")

    res = list_clips()
    assert res['total'] == 3
    assert len(res['clips']) == 3

    # Check sorting (newest first)
    assert res['clips'][0]['clip_id'] == "clip3"

    # Filter by zone
    res = list_clips(zone_id="zone1")
    assert res['total'] == 2

    # Filter by status
    res = list_clips(status="pending")
    assert res['total'] == 2
    assert res['clips'][0]['clip_id'] == "clip2"


def test_clips_service_get_clip_metadata(mock_clips_workspace):
    _create_mock_clip(mock_clips_workspace, "pending", "clip1", "zone1", "2026-05-01")

    meta = get_clip_metadata("clip1")
    assert meta is not None
    assert meta['clip_id'] == "clip1"

    meta = get_clip_metadata("nonexistent")
    assert meta is None


def test_clips_service_update_clip_review(mock_clips_workspace):
    _create_mock_clip(mock_clips_workspace, "pending", "clip1", "zone1", "2026-05-01")

    meta = update_clip_review("clip1", "confirmed", "user1", "test notes")
    assert meta is not None
    assert meta['review']['status'] == "confirmed"
    assert meta['review']['notes'] == "test notes"
    assert meta['review']['reviewed_by'] == "user1"

    # Verify it moved to confirmed folder
    assert os.path.exists(os.path.join(mock_clips_workspace, "confirmed", "zone1", "clip1.mp4"))
    assert os.path.exists(os.path.join(mock_clips_workspace, "confirmed", "zone1", "clip1.json"))
    assert not os.path.exists(os.path.join(mock_clips_workspace, "pending", "zone1", "clip1.json"))

    # Update on already reviewed clip (idempotency check)
    meta = update_clip_review("clip1", "confirmed", "user2", "more notes")
    assert meta is not None
    assert meta['review']['notes'] == "more notes"
    # Should still be in confirmed
    assert os.path.exists(os.path.join(mock_clips_workspace, "confirmed", "zone1", "clip1.json"))


def test_clips_service_update_clip_review_dismissed(mock_clips_workspace):
    _create_mock_clip(mock_clips_workspace, "pending", "clip1", "zone1", "2026-05-01")

    meta = update_clip_review("clip1", "dismissed", "user1")
    assert meta is not None

    # Verify it moved to dismissed folder
    assert os.path.exists(os.path.join(mock_clips_workspace, "dismissed", "zone1", "clip1.mp4"))
