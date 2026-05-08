"""
Unit tests for Phase 1: AlertJournal, CameraConfigCache.

Covers:
- AlertJournal: enqueue, flush, pending_count, retry loop, queue eviction
- CameraConfigCache: save, load, expiry, corruption handling
"""
import json
import os
import tempfile
import time

import pytest

from detection_engine.alert.alert_journal import AlertJournal
from detection_engine.camera.config_cache import CameraConfigCache


# ═══════════════════════════════════════════════════════════════════════════════
# AlertJournal Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestAlertJournal:
    """SQLite store-and-forward alert journal tests."""

    @pytest.fixture
    def journal(self, tmp_path):
        """Create a journal in a temp directory."""
        j = AlertJournal(data_dir=str(tmp_path))
        yield j
        j.stop()

    @pytest.fixture
    def sample_payload(self):
        return {
            "event_id": "test-event-001",
            "zone_id": "pool-1",
            "track_id": "42",
            "class_label": "drowning",
            "confidence_score": 0.95,
            "detected_at": "2025-01-01T00:00:00Z",
            "alert_triggered": True,
        }

    def test_enqueue_and_count(self, journal, sample_payload):
        """Enqueue a payload and verify pending count."""
        assert journal.pending_count() == 0
        result = journal.enqueue(sample_payload)
        assert result is True
        assert journal.pending_count() == 1

    def test_duplicate_event_id_ignored(self, journal, sample_payload):
        """Duplicate event_id is silently ignored (INSERT OR IGNORE)."""
        journal.enqueue(sample_payload)
        journal.enqueue(sample_payload)  # Same event_id
        assert journal.pending_count() == 1

    def test_enqueue_without_event_id_rejected(self, journal):
        """Payload without event_id is rejected."""
        result = journal.enqueue({"zone_id": "pool-1"})
        assert result is False
        assert journal.pending_count() == 0

    def test_flush_delivers_and_removes(self, journal, sample_payload):
        """flush() delivers alerts and removes them from the journal."""
        journal.enqueue(sample_payload)

        delivered = []

        def mock_post(payload):
            delivered.append(payload)
            return True

        count = journal.flush(mock_post)
        assert count == 1
        assert len(delivered) == 1
        assert delivered[0]["event_id"] == "test-event-001"
        assert journal.pending_count() == 0

    def test_flush_stops_on_failure(self, journal):
        """flush() stops on first delivery failure (API still down)."""
        journal.enqueue({"event_id": "e1", "zone_id": "z1"})
        journal.enqueue({"event_id": "e2", "zone_id": "z1"})

        def mock_post(payload):
            if payload["event_id"] == "e1":
                return True
            return False  # e2 fails

        count = journal.flush(mock_post)
        assert count == 1
        assert journal.pending_count() == 1  # e2 still pending

    def test_queue_eviction_when_full(self, journal, sample_payload):
        """Oldest entry is evicted when queue exceeds max."""
        # Override max for testing
        import detection_engine.alert.alert_journal as mod
        original_max = mod._MAX_PENDING_ALERTS
        mod._MAX_PENDING_ALERTS = 3

        try:
            for i in range(4):
                journal.enqueue({
                    "event_id": f"e-{i}",
                    "zone_id": "z1",
                })
            assert journal.pending_count() == 3

            # First event should have been evicted
            delivered = []

            def mock_post(payload):
                delivered.append(payload["event_id"])
                return True

            journal.flush(mock_post)
            assert "e-0" not in delivered  # Oldest was evicted
        finally:
            mod._MAX_PENDING_ALERTS = original_max

    def test_flush_order_is_fifo(self, journal):
        """Alerts are flushed in insertion order (oldest first)."""
        for i in range(3):
            journal.enqueue({"event_id": f"e-{i}", "zone_id": "z1"})

        order = []

        def mock_post(payload):
            order.append(payload["event_id"])
            return True

        journal.flush(mock_post)
        assert order == ["e-0", "e-1", "e-2"]


# ═══════════════════════════════════════════════════════════════════════════════
# CameraConfigCache Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestCameraConfigCache:
    """Camera config cache for offline startup."""

    @pytest.fixture
    def cache(self, tmp_path):
        return CameraConfigCache(data_dir=str(tmp_path))

    @pytest.fixture
    def sample_cameras(self):
        return [
            {
                "zone_id": "pool-1",
                "rtsp_url": "rtsp://192.168.1.100:554/stream",
                "frame_rate": 30,
                "zone_name": "Main Pool",
            },
            {
                "zone_id": "pool-2",
                "rtsp_url": "rtsp://192.168.1.101:554/stream",
                "frame_rate": 25,
                "zone_name": "Kiddie Pool",
            },
        ]

    def test_load_returns_none_when_no_cache(self, cache):
        """load() returns None if no cache file exists."""
        result = cache.load()
        assert result is None

    def test_save_and_load(self, cache, sample_cameras):
        """save() persists cameras, load() retrieves them."""
        assert cache.save(sample_cameras) is True
        loaded = cache.load()
        assert loaded is not None
        assert len(loaded) == 2
        assert loaded[0]["zone_id"] == "pool-1"
        assert loaded[1]["zone_id"] == "pool-2"

    def test_load_returns_none_on_corrupted_json(self, cache):
        """load() returns None if cache file is corrupted."""
        with open(cache.cache_path, "w") as f:
            f.write("not valid json {{{")
        result = cache.load()
        assert result is None

    def test_load_returns_none_on_empty_cameras(self, cache):
        """load() returns None if cameras list is empty."""
        cache_data = {"cameras": [], "cached_at": time.time()}
        with open(cache.cache_path, "w") as f:
            json.dump(cache_data, f)
        result = cache.load()
        assert result is None

    def test_load_returns_none_on_expired_cache(self, cache, sample_cameras):
        """load() returns None if cache is older than 7 days."""
        cache_data = {
            "cameras": sample_cameras,
            "cached_at": time.time() - (8 * 24 * 3600),  # 8 days ago
        }
        with open(cache.cache_path, "w") as f:
            json.dump(cache_data, f)
        result = cache.load()
        assert result is None

    def test_save_overwrites_previous(self, cache, sample_cameras):
        """save() overwrites previous cache."""
        cache.save(sample_cameras)
        cache.save([sample_cameras[0]])  # Only 1 camera
        loaded = cache.load()
        assert len(loaded) == 1

    def test_cache_path_property(self, cache):
        """cache_path returns a valid file path."""
        assert cache.cache_path.endswith("cameras_cache.json")
