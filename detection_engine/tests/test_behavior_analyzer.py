"""Unit tests for BehaviorAnalyzer."""
import numpy as np
import pytest

from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
from detection_engine.models_data.landmark import Landmark


def _make_landmarks(override: dict = None) -> list:
    """Build 33 landmarks with sensible defaults; override specific indices."""
    lms = [Landmark(x=0.5, y=float(i) / 33, z=0.0, visibility=0.9) for i in range(33)]
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

    def test_temporal_consistency_increases_score(self, dummy_landmarks):
        """Feeding high scores repeatedly should apply temporal bonus."""
        analyzer = BehaviorAnalyzer()
        scores = []
        for i in range(10):
            s = analyzer.analyze(dummy_landmarks, "drowning", 0.9, "track_t")
            scores.append(s)
        # Later scores (with history) should be >= earlier scores
        assert scores[-1] >= scores[0]

    def test_separate_track_ids_are_independent(self, dummy_landmarks):
        analyzer = BehaviorAnalyzer()
        s1 = analyzer.analyze(dummy_landmarks, "swimming", 0.3, "track_x")
        s2 = analyzer.analyze(dummy_landmarks, "swimming", 0.3, "track_y")
        # Both tracks start fresh — scores should be equal
        assert abs(s1 - s2) < 1e-9


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

    def test_face_submerged_low_visibility(self):
        lms = _make_landmarks({0: dict(x=0.5, y=0.1, z=0.0, visibility=0.1)})
        assert self.analyzer._is_face_submerged(lms) is True

    def test_face_not_submerged_high_visibility(self):
        lms = _make_landmarks({0: dict(x=0.5, y=0.1, z=0.0, visibility=0.9)})
        assert self.analyzer._is_face_submerged(lms) is False

    def test_no_limb_motion_requires_history(self):
        """Not enough frames → returns False (insufficient history)."""
        lms = _make_landmarks()
        result = self.analyzer._no_limb_motion("track_new", lms)
        assert result is False

    def test_no_limb_motion_with_static_landmarks(self):
        """Static wrists/ankles over many frames → True."""
        lms = _make_landmarks({
            15: dict(x=0.3, y=0.5, z=0.0, visibility=0.9),
            16: dict(x=0.7, y=0.5, z=0.0, visibility=0.9),
            27: dict(x=0.3, y=0.9, z=0.0, visibility=0.9),
            28: dict(x=0.7, y=0.9, z=0.0, visibility=0.9),
        })
        for _ in range(10):
            self.analyzer._no_limb_motion("track_static", lms)
        assert self.analyzer._no_limb_motion("track_static", lms) is True
