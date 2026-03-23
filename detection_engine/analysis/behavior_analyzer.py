"""Behavior analyzer — 5-indicator drowning score with temporal consistency."""
import logging
from collections import deque
from typing import Dict, Iterable, List

import numpy as np

from detection_engine.models_data.landmark import Landmark

from config.settings import (
    WEIGHT_VERTICAL_ORIENTATION,
    WEIGHT_ARMS_ELEVATED,
    WEIGHT_NO_LIMB_MOTION,
    WEIGHT_FACE_SUBMERGED,
    WEIGHT_YOLO_CLASS,
    VERTICAL_ANGLE_THRESHOLD_DEG,
    LIMB_MOTION_STD_THRESHOLD,
    FACE_VISIBILITY_THRESHOLD,
    YOLO_DROWNING_CONF_BOOST,
)

logger = logging.getLogger(__name__)

# Number of historical frames to keep for limb motion detection
_MOTION_HISTORY_LEN = 10
# Number of past scores kept for temporal consistency bonus
_SCORE_HISTORY_LEN = 5


class BehaviorAnalyzer:
    """Scores each tracked person for drowning behavior (0.0–1.0)."""

    def __init__(self):
        # Per-track landmark histories for limb motion (wrist_x, ankle_x)
        self._wrist_history: Dict[str, deque] = {}
        self._ankle_history: Dict[str, deque] = {}
        # Per-track rolling score history for temporal consistency
        self._score_history: Dict[str, deque] = {}

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

        # ── Indicator evaluation ──────────────────────────────────────────────
        vertical = self._is_vertical_orientation(landmarks)
        arms_up = self._are_arms_elevated(landmarks)
        no_motion = self._no_limb_motion(track_id, landmarks)
        face_sub = self._is_face_submerged(landmarks)
        yolo_boost = self._yolo_class_score(yolo_class, yolo_conf)

        raw_score = (
            WEIGHT_VERTICAL_ORIENTATION * float(vertical)
            + WEIGHT_ARMS_ELEVATED * float(arms_up)
            + WEIGHT_NO_LIMB_MOTION * float(no_motion)
            + WEIGHT_FACE_SUBMERGED * float(face_sub)
            + WEIGHT_YOLO_CLASS * yolo_boost
        )

        # ── Temporal consistency bonus ────────────────────────────────────────
        if track_id not in self._score_history:
            self._score_history[track_id] = deque(maxlen=_SCORE_HISTORY_LEN)
        hist = self._score_history[track_id]
        temporal_ratio = (
            sum(1 for s in hist if s > 0.5) / _SCORE_HISTORY_LEN
            if len(hist) == _SCORE_HISTORY_LEN else 0.0
        )
        final_score = min(1.0, raw_score * (1.0 + 0.1 * temporal_ratio))
        hist.append(raw_score)

        return final_score

    # ── Private indicator methods ─────────────────────────────────────────────

    def _is_vertical_orientation(self, landmarks: List[Landmark]) -> bool:
        """True if body vector is within VERTICAL_ANGLE_THRESHOLD_DEG from vertical."""
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
        """True if both wrists are above their respective shoulders (smaller y = higher)."""
        left_wrist_above = landmarks[15].y < landmarks[11].y
        right_wrist_above = landmarks[16].y < landmarks[12].y
        return left_wrist_above and right_wrist_above

    def _no_limb_motion(self, track_id: str, landmarks: List[Landmark]) -> bool:
        """True if wrists and ankles show minimal movement over recent frames.

        CRITICAL: MediaPipe coords are normalized [0.0, 1.0] — threshold is
        LIMB_MOTION_STD_THRESHOLD = 0.015 (NOT a pixel value).
        """
        if track_id not in self._wrist_history:
            self._wrist_history[track_id] = deque(maxlen=_MOTION_HISTORY_LEN)
            self._ankle_history[track_id] = deque(maxlen=_MOTION_HISTORY_LEN)

        # Use average of both wrists/ankles for robustness
        wrist_x = (landmarks[15].x + landmarks[16].x) / 2.0
        ankle_x = (landmarks[27].x + landmarks[28].x) / 2.0

        self._wrist_history[track_id].append(wrist_x)
        self._ankle_history[track_id].append(ankle_x)

        if len(self._wrist_history[track_id]) < 5:
            return False  # not enough history yet

        wrist_std = float(np.std(list(self._wrist_history[track_id])))
        ankle_std = float(np.std(list(self._ankle_history[track_id])))

        return wrist_std < LIMB_MOTION_STD_THRESHOLD and ankle_std < LIMB_MOTION_STD_THRESHOLD

    def _is_face_submerged(self, landmarks: List[Landmark]) -> bool:
        """True if nose landmark (index 0) visibility is below threshold."""
        return landmarks[0].visibility < FACE_VISIBILITY_THRESHOLD

    def _yolo_class_score(self, yolo_class: str, yolo_conf: float) -> float:
        """Return weighted YOLO class contribution."""
        if yolo_class == "drowning" and yolo_conf >= YOLO_DROWNING_CONF_BOOST:
            return 1.0
        return 0.0

    def cleanup_stale_tracks(self, active_track_ids: Iterable[str]) -> None:
        """Drop per-track history for IDs not present in the current frame."""
        active = set(active_track_ids)
        stale_ids = [track_id for track_id in self._score_history if track_id not in active]
        for track_id in stale_ids:
            self._score_history.pop(track_id, None)
            self._wrist_history.pop(track_id, None)
            self._ankle_history.pop(track_id, None)
