"""Unit tests for BehaviorAnalyzer."""
import numpy as np
import pytest

from config.settings import LIMB_MOTION_MIN_HISTORY_FRAMES, SPLASHING_MIN_CONSECUTIVE
from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
from detection_engine.models_data.landmark import Landmark


def _make_landmarks(override: dict = None) -> list:
    """Build 33 landmarks with sensible defaults; override specific indices."""
    lms = [Landmark(x=0.5, y=float(i) / 33, z=0.0, visibility=0.9) for i in range(33)]
    # Submerge legs by default to avoid the full-body visible hard gate
    for i in [25, 26, 27, 28]:
        lms[i].visibility = 0.1
    if override:
        for idx, kw in override.items():
            lms[idx] = Landmark(**kw)
    return lms


class TestBehaviorAnalyzerScore:
    def setup_method(self):
        self.analyzer = BehaviorAnalyzer()

    def test_score_in_range(self, dummy_landmarks):
        score = self.analyzer.analyze(dummy_landmarks, "swimming", 0.5, "track_1")
        assert 0.0 <= score <= 1.0

    def test_drowning_class_boosts_score(self, dummy_landmarks):
        score_swim = self.analyzer.analyze(dummy_landmarks, "swimming", 0.8, "track_a")
        analyzer2 = BehaviorAnalyzer()
        score_drown = analyzer2.analyze(dummy_landmarks, "drowning", 0.9, "track_b")
        assert score_drown > score_swim



    def test_separate_track_ids_are_independent(self, dummy_landmarks):
        analyzer = BehaviorAnalyzer()
        s1 = analyzer.analyze(dummy_landmarks, "swimming", 0.3, "track_x")
        s2 = analyzer.analyze(dummy_landmarks, "swimming", 0.3, "track_y")
        # Both tracks start fresh — scores should be equal
        assert abs(s1 - s2) < 1e-9

    def test_analyze_returns_zero_when_landmarks_none(self):
        assert self.analyzer.analyze(None, "swimming", 0.4, "track_none") == 0.0

    def test_analyze_returns_zero_when_landmarks_too_short(self):
        short_landmarks = [Landmark(x=0.1, y=0.1, z=0.0, visibility=1.0)] * 10
        assert self.analyzer.analyze(short_landmarks, "swimming", 0.4, "track_short") == 0.0


class TestBehaviorAnalyzerIndicators:
    def setup_method(self):
        self.analyzer = BehaviorAnalyzer()

    def test_vertical_orientation_detected(self):
        """Shoulders above hips with small horizontal offset → vertical."""
        lms = _make_landmarks({
            11: dict(x=0.5, y=0.3, z=0.0, visibility=0.9),  # left shoulder
            12: dict(x=0.5, y=0.3, z=0.0, visibility=0.9),  # right shoulder
            23: dict(x=0.5, y=0.6, z=0.0, visibility=0.9),  # left hip
            24: dict(x=0.5, y=0.6, z=0.0, visibility=0.9),  # right hip
        })
        assert self.analyzer._is_vertical_orientation(lms)

    def test_horizontal_orientation_not_vertical(self):
        """Shoulders and hips at the same y → nearly horizontal body."""
        lms = _make_landmarks({
            11: dict(x=0.3, y=0.5, z=0.0, visibility=0.9),
            12: dict(x=0.4, y=0.5, z=0.0, visibility=0.9),
            23: dict(x=0.7, y=0.5, z=0.0, visibility=0.9),
            24: dict(x=0.8, y=0.5, z=0.0, visibility=0.9),
        })
        assert not self.analyzer._is_vertical_orientation(lms)

    def test_arms_elevated_when_wrists_above_shoulders(self):
        lms = _make_landmarks({
            15: dict(x=0.3, y=0.1, z=0.0, visibility=0.9),  # left wrist (high)
            16: dict(x=0.7, y=0.1, z=0.0, visibility=0.9),  # right wrist (high)
            11: dict(x=0.3, y=0.4, z=0.0, visibility=0.9),  # left shoulder (low)
            12: dict(x=0.7, y=0.4, z=0.0, visibility=0.9),  # right shoulder (low)
        })
        assert self.analyzer._are_arms_elevated(lms) is True

    def test_arms_not_elevated_when_wrists_below_shoulders(self):
        lms = _make_landmarks({
            15: dict(x=0.3, y=0.7, z=0.0, visibility=0.9),  # wrist below
            16: dict(x=0.7, y=0.7, z=0.0, visibility=0.9),
            11: dict(x=0.3, y=0.3, z=0.0, visibility=0.9),  # shoulder above
            12: dict(x=0.7, y=0.3, z=0.0, visibility=0.9),
        })
        assert self.analyzer._are_arms_elevated(lms) is False

    def test_face_submerged_when_visibility_low(self):
        lms = _make_landmarks({
            0: dict(x=0.5, y=0.2, z=0.0, visibility=0.1),
        })
        assert self.analyzer._is_face_submerged(lms) is True

    def test_no_limb_motion_detects_still_limbs(self):
        lms = _make_landmarks({
            15: dict(x=0.4, y=0.3, z=0.0, visibility=0.9),
            16: dict(x=0.6, y=0.3, z=0.0, visibility=0.9),
            27: dict(x=0.4, y=0.9, z=0.0, visibility=0.9),
            28: dict(x=0.6, y=0.9, z=0.0, visibility=0.9),
        })
        result = None
        for _ in range(LIMB_MOTION_MIN_HISTORY_FRAMES):
            result = self.analyzer._no_limb_motion("track_limb", lms)
        assert result is True

    def test_consecutive_splashing_detected(self):
        lms_low = _make_landmarks({
            15: dict(x=0.4, y=0.3, z=0.0, visibility=0.9),
            16: dict(x=0.6, y=0.3, z=0.0, visibility=0.9),
            27: dict(x=0.4, y=0.8, z=0.0, visibility=0.9),
            28: dict(x=0.6, y=0.8, z=0.0, visibility=0.9),
        })
        lms_high = _make_landmarks({
            15: dict(x=0.4, y=0.6, z=0.0, visibility=0.9),
            16: dict(x=0.6, y=0.6, z=0.0, visibility=0.9),
            27: dict(x=0.4, y=0.95, z=0.0, visibility=0.9),
            28: dict(x=0.6, y=0.95, z=0.0, visibility=0.9),
        })

        result = None
        for idx in range(SPLASHING_MIN_CONSECUTIVE + 1):
            frame = lms_low if idx % 2 == 0 else lms_high
            result = self.analyzer._is_consecutive_splashing("track_splash", frame)

        assert result is True




def test_cleanup_stale_tracks_removes_inactive_histories(dummy_landmarks):
    analyzer = BehaviorAnalyzer()
    analyzer._no_breathing_motion("keep", dummy_landmarks)
    analyzer._no_breathing_motion("stale", dummy_landmarks)
    limb_landmarks = _make_landmarks({
        15: dict(x=0.4, y=0.3, z=0.0, visibility=0.9),
        16: dict(x=0.6, y=0.3, z=0.0, visibility=0.9),
        27: dict(x=0.4, y=0.9, z=0.0, visibility=0.9),
        28: dict(x=0.6, y=0.9, z=0.0, visibility=0.9),
    })
    analyzer._no_limb_motion("keep", limb_landmarks)
    analyzer._no_limb_motion("stale", limb_landmarks)
    analyzer._is_consecutive_splashing("keep", limb_landmarks)
    analyzer._is_consecutive_splashing("stale", limb_landmarks)

    analyzer.cleanup_stale_tracks({"keep"})

    assert "keep" in analyzer._head_history
    assert "stale" not in analyzer._head_history
    assert "keep" in analyzer._limb_history
    assert "stale" not in analyzer._limb_history
    assert "keep" in analyzer._splash_last_positions
    assert "stale" not in analyzer._splash_last_positions


def test_same_track_id_is_isolated_when_analyzers_are_per_zone(dummy_landmarks):
    """Same ByteTrack ID in different zones must not share temporal history."""
    zone_a_analyzer = BehaviorAnalyzer()
    zone_b_analyzer = BehaviorAnalyzer()

    # Build temporal history in zone A for track "1".
    for _ in range(6):
        zone_a_analyzer.analyze(dummy_landmarks, "drowning", 0.95, "1")

    # Zone B (same track id string) is a fresh analyzer instance.
    score_b_first = zone_b_analyzer.analyze(dummy_landmarks, "drowning", 0.95, "1")

    # Its first score should match a fresh analyzer baseline.
    fresh = BehaviorAnalyzer()
    baseline = fresh.analyze(dummy_landmarks, "drowning", 0.95, "1")
    assert score_b_first == pytest.approx(baseline)
