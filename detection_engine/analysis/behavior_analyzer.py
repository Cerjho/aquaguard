"""Behavior analyzer — water-level drowning detection with 5 indicators + dynamic normalization."""
import logging
from collections import deque
from typing import Dict, Iterable, List, Optional

import numpy as np

from detection_engine.models_data.landmark import Landmark

from config.settings import (
    WEIGHT_VERTICAL_ORIENTATION,
    WEIGHT_ARMS_ELEVATED,
    WEIGHT_HEAD_POSITION_LOW,
    WEIGHT_NO_BREATHING_MOTION,
    WEIGHT_YOLO_CLASS,
    VERTICAL_ANGLE_THRESHOLD_DEG,
    HEAD_LOW_THRESHOLD,
    LIMB_VISIBILITY_MIN_THRESHOLD,
    NO_BREATHING_HISTORY_LEN,
    NO_BREATHING_VARIANCE_THRESHOLD,
    YOLO_DROWNING_CONF_BOOST,
)

logger = logging.getLogger(__name__)


class BehaviorAnalyzer:
    """Scores each tracked person for drowning behavior (0.0–1.0).

    Water-level tuned with 5 indicators:
    1. Vertical orientation (body upright)
    2. Arms elevated (panic response)
    3. Head position low (head stuck at water line)  ← NEW
    4. No breathing motion (no head bobbing)         ← NEW
    5. YOLO class ("drowning" classification)

    All scores normalized dynamically based on visibility gating.
    """

    def __init__(self):
        # Per-track head position history for breathing detection
        self._head_history: Dict[str, deque] = {}

    def analyze(
        self,
        landmarks: List[Landmark],
        yolo_class: str,
        yolo_conf: float,
        track_id: str,
    ) -> float:
        """Compute a drowning probability score in [0.0, 1.0].

        Args:
            landmarks:  33 MediaPipe landmarks with normalized coords.
            yolo_class: YOLO class label string.
            yolo_conf:  YOLO detection confidence.
            track_id:   Unique ByteTrack ID string.

        Returns:
            Final drowning score in [0.0, 1.0].
        """
        if not isinstance(landmarks, list) or len(landmarks) < 33:
            logger.warning("Invalid landmarks for track %s; returning 0.0", track_id)
            return 0.0

        # ── Evaluate all indicators ──────────────────────────────────────────
        # Build dict of (weight, value) pairs; None means gated out
        indicators = {}

        # Indicator 1: Vertical orientation
        vert_val = self._is_vertical_orientation(landmarks)
        indicators['vertical'] = (WEIGHT_VERTICAL_ORIENTATION, float(vert_val))

        # Indicator 2: Arms elevated
        if landmarks[15].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD and \
           landmarks[16].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD:
            arms_val = self._are_arms_elevated(landmarks)
            indicators['arms_elevated'] = (WEIGHT_ARMS_ELEVATED, float(arms_val))
        else:
            indicators['arms_elevated'] = (WEIGHT_ARMS_ELEVATED, None)

        # Indicator 3: Head position low (NEW)
        head_val = self._is_head_position_low(landmarks)
        indicators['head_low'] = (WEIGHT_HEAD_POSITION_LOW, float(head_val))

        # Indicator 4: No breathing motion (NEW)
        breath_val = self._no_breathing_motion(track_id, landmarks)
        indicators['no_breathing'] = (WEIGHT_NO_BREATHING_MOTION, float(breath_val))

        # Indicator 5: YOLO class
        yolo_val = self._yolo_class_score(yolo_class, yolo_conf)
        indicators['yolo'] = (WEIGHT_YOLO_CLASS, yolo_val)

        # ── Dynamic normalization (only count non-gated indicators) ──────────
        final_score = self._compute_final_score(indicators)

        logger.debug(
            "Track %s: vertical=%.2f arms=%s head_low=%.2f breathing=%.2f yolo=%.2f → score=%.3f",
            track_id,
            indicators['vertical'][1],
            "None" if indicators['arms_elevated'][1] is None else f"{indicators['arms_elevated'][1]:.2f}",
            indicators['head_low'][1],
            indicators['no_breathing'][1],
            indicators['yolo'][1],
            final_score,
        )

        return final_score

    # ── Private indicator methods ─────────────────────────────────────────────

    def _is_vertical_orientation(self, landmarks: List[Landmark]) -> bool:
        """True if body vector is within VERTICAL_ANGLE_THRESHOLD_DEG from vertical.

        At water level, drowning posture is more vertical (head down into water).
        """
        shoulder_x = (landmarks[11].x + landmarks[12].x) / 2.0
        shoulder_y = (landmarks[11].y + landmarks[12].y) / 2.0
        hip_x = (landmarks[23].x + landmarks[24].x) / 2.0
        hip_y = (landmarks[23].y + landmarks[24].y) / 2.0

        dx = hip_x - shoulder_x
        dy = hip_y - shoulder_y  # y increases downward in image coords

        # Angle from vertical (0°=straight down, 90°=horizontal)
        angle_deg = abs(np.degrees(np.arctan2(dx, dy)))
        return angle_deg < VERTICAL_ANGLE_THRESHOLD_DEG

    def _are_arms_elevated(self, landmarks: List[Landmark]) -> bool:
        """True if both wrists are above their respective shoulders (smaller y = higher).

        Panic response: arms raised (wrists well above shoulders).
        """
        left_wrist_above = landmarks[15].y < landmarks[11].y
        right_wrist_above = landmarks[16].y < landmarks[12].y
        return left_wrist_above and right_wrist_above

    def _is_head_position_low(self, landmarks: List[Landmark]) -> bool:
        """True if head is stuck at shoulder level (at water line).

        NEW INDICATOR: Most reliable for water-level drowning.
        Drowning: head tilted down, roughly level with shoulders
        Normal: head raised above shoulders (breathing position)
        """
        head_y = landmarks[0].y  # Nose
        shoulder_y = (landmarks[11].y + landmarks[12].y) / 2.0

        # Head at same level as shoulders (within threshold)
        head_distance = abs(head_y - shoulder_y)
        return head_distance < HEAD_LOW_THRESHOLD

    def _no_breathing_motion(self, track_id: str, landmarks: List[Landmark]) -> bool:
        """True if head position shows no breathing pattern (no bobbing motion).

        NEW INDICATOR: Temporal signal across frames.
        Normal swimmer: periodic head-back motion (breathing)
        Drowning: head stuck in one position (no motion variance)

        Uses head_y coordinate history to detect breathing-like vertical motion.
        """
        if track_id not in self._head_history:
            self._head_history[track_id] = deque(maxlen=NO_BREATHING_HISTORY_LEN)

        head_y = landmarks[0].y  # Nose y-coordinate
        self._head_history[track_id].append(head_y)

        if len(self._head_history[track_id]) < 3:
            return False  # Not enough history yet

        # Calculate variance in head position
        head_positions = list(self._head_history[track_id])
        head_variance = float(np.var(head_positions))

        # Low variance = frozen head (no breathing motion)
        return head_variance < NO_BREATHING_VARIANCE_THRESHOLD

    def _yolo_class_score(self, yolo_class: str, yolo_conf: float) -> float:
        """Return YOLO class contribution (0.0 or 1.0).

        YOLO trained on surface-level data, most reliable for classification.
        """
        if yolo_class == "drowning" and yolo_conf >= YOLO_DROWNING_CONF_BOOST:
            return 1.0
        return 0.0

    def _compute_final_score(self, indicators: Dict[str, tuple]) -> float:
        """Compute final score with dynamic normalization.

        Only counts non-gated (non-None) indicators.
        If arms underwater (visibility < threshold), their indicator is None.
        Denominator shrinks accordingly to prevent penalty.

        Args:
            indicators: dict of {name: (weight, value_or_None)}

        Returns:
            Normalized score in [0.0, 1.0]
        """
        total_weight = 0.0
        weighted_sum = 0.0

        for name, (weight, value) in indicators.items():
            if value is not None:
                total_weight += weight
                weighted_sum += weight * value

        if total_weight == 0.0:
            return 0.0

        # Normalize to [0, 1] using only active indicators
        normalized_score = weighted_sum / total_weight
        return min(1.0, normalized_score)

    def cleanup_stale_tracks(self, active_track_ids: Iterable[str]) -> None:
        """Drop per-track history for IDs not present in the current frame."""
        active = set(active_track_ids)
        stale_ids = [track_id for track_id in self._head_history if track_id not in active]
        for track_id in stale_ids:
            self._head_history.pop(track_id, None)
