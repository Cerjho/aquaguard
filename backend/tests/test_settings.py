import pytest
from config.settings import validate_runtime_settings, CLIP_PRE_BUFFER_SECONDS, CLIP_POST_BUFFER_SECONDS, CLIP_MIN_FREE_DISK_GB, CLIP_MAX_PER_HOUR, CLIP_JPEG_QUALITY

def test_validate_runtime_settings_valid_defaults():
    # Calling validate_runtime_settings shouldn't raise any exception with default valid config
    validate_runtime_settings()

def test_validate_runtime_settings_clip_pre_buffer(monkeypatch):
    monkeypatch.setattr('config.settings.CLIP_PRE_BUFFER_SECONDS', 0)
    with pytest.raises(ValueError, match="CLIP_PRE_BUFFER_SECONDS must be >= 1"):
        validate_runtime_settings()

def test_validate_runtime_settings_clip_post_buffer(monkeypatch):
    monkeypatch.setattr('config.settings.CLIP_POST_BUFFER_SECONDS', 0)
    with pytest.raises(ValueError, match="CLIP_POST_BUFFER_SECONDS must be >= 1"):
        validate_runtime_settings()

def test_validate_runtime_settings_clip_min_free_disk(monkeypatch):
    monkeypatch.setattr('config.settings.CLIP_MIN_FREE_DISK_GB', -1)
    with pytest.raises(ValueError, match="CLIP_MIN_FREE_DISK_GB must be >= 0"):
        validate_runtime_settings()

def test_validate_runtime_settings_clip_max_per_hour(monkeypatch):
    monkeypatch.setattr('config.settings.CLIP_MAX_PER_HOUR', 0)
    with pytest.raises(ValueError, match="CLIP_MAX_PER_HOUR must be >= 1"):
        validate_runtime_settings()

def test_validate_runtime_settings_clip_jpeg_quality(monkeypatch):
    monkeypatch.setattr('config.settings.CLIP_JPEG_QUALITY', 0)
    with pytest.raises(ValueError, match=r"CLIP_JPEG_QUALITY must be in range 1\.\.95"):
        validate_runtime_settings()
