"""Confidence filter — rolling window alert confirmation (N, T, K parameters)."""
import logging
from collections import deque
from typing import Dict, Iterable

import numpy as np

from config.settings import (
    CONFIDENCE_WINDOW_SIZE,
    CONFIDENCE_THRESHOLD,
    CONSECUTIVE_FRAMES_REQUIRED,
    CONSECUTIVE_FRAME_LOW_THRESHOLD,
)

logger = logging.getLogger(__name__)


class ConfidenceFilter:
    """Two-condition rolling window filter to confirm drowning alerts.

    Condition 1: mean score over N-frame window > T
    Condition 2: at least K of the last K frames scored > low_threshold

    Both conditions must be true before an alert fires.
    On trigger, the buffer for that track is cleared to prevent re-firing.
    """

    def __init__(self):
        self._buffers: Dict[str, deque] = {}

    def evaluate(self, track_id: str, score: float) -> bool:
        """Evaluate whether this track should trigger a drowning alert.

        Args:
            track_id: ByteTrack unique string identifier.
            score:    Behavior analyzer output in [0.0, 1.0].

        Returns:
            True if both rolling-window conditions are satisfied.
        """
        if track_id not in self._buffers:
            self._buffers[track_id] = deque(maxlen=CONFIDENCE_WINDOW_SIZE)

        buf = self._buffers[track_id]
        buf.append(score)

        if len(buf) < CONFIDENCE_WINDOW_SIZE:
            return False  # window not yet full

        # Condition 1: mean of full window
        mean_score = float(np.mean(buf))
        cond1 = mean_score > CONFIDENCE_THRESHOLD

        # Condition 2: last K frames all exceed low threshold
        recent = list(buf)[-CONSECUTIVE_FRAMES_REQUIRED:]
        hits = sum(1 for s in recent if s > CONSECUTIVE_FRAME_LOW_THRESHOLD)
        cond2 = hits >= CONSECUTIVE_FRAMES_REQUIRED

        if cond1 and cond2:
            logger.info(
                "Alert confirmed for track %s (mean=%.3f, hits=%d/%d)",
                track_id, mean_score, hits, CONSECUTIVE_FRAMES_REQUIRED,
            )
            buf.clear()  # reset so same track doesn't re-fire immediately
            return True

        return False

    def remove_track(self, track_id: str) -> None:
        """Remove stale track buffer when person leaves the scene."""
        self._buffers.pop(track_id, None)

    def cleanup_stale_tracks(self, active_track_ids: Iterable[str]) -> None:
        """Drop buffers for tracks not present in current frame."""
        active = set(active_track_ids)
        stale_ids = [track_id for track_id in self._buffers if track_id not in active]
        for track_id in stale_ids:
            self._buffers.pop(track_id, None)
