"""Unit tests for ConfidenceFilter."""
import pytest

from detection_engine.analysis.confidence_filter import ConfidenceFilter
from config.settings import (
    CONFIDENCE_WINDOW_SIZE,
    CONFIDENCE_THRESHOLD,
    CONSECUTIVE_FRAMES_REQUIRED,
    CONSECUTIVE_FRAME_LOW_THRESHOLD,
)


class TestConfidenceFilterWindow:
    def setup_method(self):
        self.cf = ConfidenceFilter()

    def test_returns_false_before_window_fills(self):
        for i in range(CONFIDENCE_WINDOW_SIZE - 1):
            result = self.cf.evaluate("trk1", 1.0)
            assert result is False, f"Should be False at step {i}"

    def test_triggers_when_window_full_and_conditions_met(self):
        """All-1.0 scores satisfy both conditions after window fills."""
        for _ in range(CONFIDENCE_WINDOW_SIZE - 1):
            self.cf.evaluate("trk2", 1.0)
        result = self.cf.evaluate("trk2", 1.0)
        assert result is True

    def test_no_trigger_with_low_scores(self):
        """All-0.0 scores never satisfy mean > T."""
        cf = ConfidenceFilter()
        for _ in range(CONFIDENCE_WINDOW_SIZE + 5):
            result = cf.evaluate("trk_low", 0.0)
        assert result is False

    def test_no_trigger_when_mean_below_threshold(self):
        """Mean just below CONFIDENCE_THRESHOLD should not trigger."""
        cf = ConfidenceFilter()
        score = CONFIDENCE_THRESHOLD - 0.05
        for _ in range(CONFIDENCE_WINDOW_SIZE + 5):
            result = cf.evaluate("trk_below", score)
        assert result is False

    def test_buffer_resets_after_trigger(self):
        """After triggering, next evaluate call should return False (buffer reset)."""
        for _ in range(CONFIDENCE_WINDOW_SIZE):
            self.cf.evaluate("trk3", 1.0)
        # Next call after reset — window is now empty → False
        result = self.cf.evaluate("trk3", 1.0)
        assert result is False

    def test_different_track_ids_are_independent(self):
        cf = ConfidenceFilter()
        for _ in range(CONFIDENCE_WINDOW_SIZE):
            cf.evaluate("track_a", 1.0)
        # track_b has no history — should be False
        result_b = cf.evaluate("track_b", 1.0)
        assert result_b is False

    def test_remove_track_clears_buffer(self):
        cf = ConfidenceFilter()
        for _ in range(CONFIDENCE_WINDOW_SIZE - 1):
            cf.evaluate("trk_rm", 1.0)
        cf.remove_track("trk_rm")
        # After removal the buffer is gone; re-adding should start fresh
        result = cf.evaluate("trk_rm", 1.0)
        assert result is False

    def test_remove_nonexistent_track_does_not_raise(self):
        cf = ConfidenceFilter()
        cf.remove_track("nonexistent")  # must not raise


class TestConfidenceFilterConditions:
    """Verify both conditions independently."""

    def test_cond1_requires_mean_above_threshold(self):
        """Condition 1: mean must exceed CONFIDENCE_THRESHOLD."""
        cf = ConfidenceFilter()
        # Fill window with mix: slightly above threshold on average
        high = CONFIDENCE_THRESHOLD + 0.1
        low = 0.0
        # Alternate to keep mean just above threshold
        for i in range(CONFIDENCE_WINDOW_SIZE):
            cf.evaluate("cond1_trk", high if i % 2 == 0 else low)

    def test_cond2_requires_k_recent_hits(self):
        """Condition 2: last K frames must all be > CONSECUTIVE_FRAME_LOW_THRESHOLD."""
        cf = ConfidenceFilter()
        # Fill window with scores below the low threshold — cond2 fails
        below = CONSECUTIVE_FRAME_LOW_THRESHOLD - 0.1
        for _ in range(CONFIDENCE_WINDOW_SIZE + 5):
            result = cf.evaluate("cond2_trk", below)
        assert result is False
