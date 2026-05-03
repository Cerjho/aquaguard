"""Behavior analyzer — water-level drowning detection with 5 indicators + dynamic normalization."""
import logging
from collections import deque
from typing import Dict, Iterable, List, Optional, Tuple

import cv2
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
    NO_BREATHING_HISTORY_FRAMES,
    NO_BREATHING_VARIANCE_THRESHOLD,
    YOLO_DROWNING_CONF_BOOST,
    WATER_ROI,
    WATER_ROI_ENABLED,
    SUPPRESS_OUT_OF_WATER_CLASS,
    PERSON_OOW_AMBIGUOUS_PENALTY,
    POSE_ABSENT_MAX_SCORE,
    ANKLE_GATE_ENABLED,
    ANKLE_VISIBILITY_MIN,
    ANKLE_HIP_MARGIN,
    ANKLE_OUT_OF_WATER_PENALTY,
    FULL_BODY_VISIBLE_GATE_ENABLED,
    FULL_BODY_VISIBILITY_MIN,
    SWIMMING_UPRIGHT_SUPPRESSION,
    SWIMMING_UPRIGHT_ANGLE_MAX,
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

        # Precompute water ROI contour for cv2.pointPolygonTest()
        self._water_roi_contour = None
        if WATER_ROI_ENABLED and WATER_ROI is not None:
            try:
                self._water_roi_contour = np.array(
                    WATER_ROI, dtype=np.float32
                ).reshape(-1, 1, 2)
                logger.info(
                    "Water ROI gate enabled with %d vertices", len(WATER_ROI)
                )
            except (ValueError, TypeError) as exc:
                logger.error(
                    "Invalid WATER_ROI configuration: %s — gate disabled", exc
                )
                self._water_roi_contour = None

    def set_water_roi(self, polygon: list) -> None:
        """Dynamically set the water ROI polygon (e.g. from auto-detection).

        Called by main.py at startup and periodically when the camera may
        have been repositioned. Replaces any previously set ROI.

        Args:
            polygon: List of [x, y] vertices in pixel coordinates.
        """
        try:
            self._water_roi_contour = np.array(
                polygon, dtype=np.float32
            ).reshape(-1, 1, 2)
            logger.info(
                "Water ROI updated dynamically with %d vertices", len(polygon)
            )
        except (ValueError, TypeError) as exc:
            logger.error("Invalid water ROI polygon: %s — gate disabled", exc)
            self._water_roi_contour = None

    def analyze(
        self,
        landmarks: List[Landmark],
        yolo_class: str,
        yolo_conf: float,
        track_id: str,
        bbox: Optional[Tuple[float, float, float, float]] = None,
    ) -> float:
        """Compute a drowning probability score in [0.0, 1.0].

        Args:
            landmarks:  33 MediaPipe landmarks with normalized coords.
            yolo_class: YOLO class label string.
            yolo_conf:  YOLO detection confidence.
            track_id:   Unique ByteTrack ID string.
            bbox:       (x1, y1, x2, y2) bounding box in full-frame pixel coords.
                        Used for water ROI gating when configured.

        Returns:
            Final drowning score in [0.0, 1.0].
        """
        has_landmarks = isinstance(landmarks, list) and len(landmarks) == 33

        # ── Pre-compute spatial context (reused by multiple layers) ───────────
        # Water ROI check — True means inside water OR gate is disabled.
        _in_water_roi = True
        _roi_cx = _roi_cy = 0.0
        if bbox is not None and self._water_roi_contour is not None:
            _roi_cx = (bbox[0] + bbox[2]) / 2.0
            _roi_cy = bbox[3]  # bottom edge = person's feet
            _in_water_roi = (
                cv2.pointPolygonTest(
                    self._water_roi_contour, (_roi_cx, _roi_cy), False
                ) >= 0
            )

        # Full-body-visible check — computed once, shared between layers.
        _full_body_on_land = (
            has_landmarks and self._is_full_body_visible(landmarks, track_id)
        )

        # ── Layer 1A: YOLO person_out_of_water — context-aware suppression ────
        # FIX R1: The old logic hard-zeroed on the YOLO label alone, causing a
        # silent miss when YOLO misclassifies a drowning swimmer as out-of-water.
        # New logic: only hard-suppress when spatial evidence corroborates the
        # label; otherwise apply a soft penalty and let pose indicators decide.
        _oow_ambiguous = False
        if SUPPRESS_OUT_OF_WATER_CLASS and yolo_class == "person_out_of_water":
            if _full_body_on_land:
                # Full skeleton visible → confirmed on dry land.
                logger.debug(
                    "Track %s suppressed — OOW class confirmed by full-body visible",
                    track_id,
                )
                return 0.0
            if not _in_water_roi:
                # Person's base is outside the pool polygon → confirmed on land.
                logger.debug(
                    "Track %s suppressed — OOW class confirmed by water ROI (base=%.0f,%.0f)",
                    track_id, _roi_cx, _roi_cy,
                )
                return 0.0
            # Ambiguous: YOLO says out-of-water but location is inside the pool
            # zone and lower body is not clearly visible (could be submerged).
            # Fall through; a penalty is applied after scoring.
            _oow_ambiguous = True
            logger.debug(
                "Track %s: OOW class is ambiguous (inside ROI, no full-body) "
                "— scoring with %.0f%% penalty",
                track_id, PERSON_OOW_AMBIGUOUS_PENALTY * 100,
            )

        if has_landmarks:
            # ── Layer 1B: Swimming + upright suppression ─────────────────────
            if self._is_swimming_but_upright(landmarks, yolo_class, track_id):
                return 0.0

            # ── Layer 1C: Full-body-visible hard gate ────────────────────────
            # Skip when _oow_ambiguous is True — already evaluated in Layer 1A.
            if not _oow_ambiguous and _full_body_on_land:
                logger.debug(
                    "Track %s suppressed — full body visible on land", track_id
                )
                return 0.0

        # ── Layer 2: Water ROI gate ───────────────────────────────────────────
        if not _in_water_roi:
            logger.debug(
                "Track %s: outside water ROI (base=%.0f,%.0f) → score=0.0",
                track_id, _roi_cx, _roi_cy,
            )
            return 0.0

        # ── Evaluate all 5 indicators ─────────────────────────────────────────
        indicators = {}

        # Indicator 1: Vertical orientation
        if has_landmarks:
            indicators['vertical'] = (
                WEIGHT_VERTICAL_ORIENTATION,
                float(self._is_vertical_orientation(landmarks)),
            )
        else:
            indicators['vertical'] = (WEIGHT_VERTICAL_ORIENTATION, None)

        # Indicator 2: Arms elevated
        if has_landmarks and landmarks[15].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD and \
           landmarks[16].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD:
            indicators['arms_elevated'] = (
                WEIGHT_ARMS_ELEVATED,
                float(self._are_arms_elevated(landmarks)),
            )
        else:
            indicators['arms_elevated'] = (WEIGHT_ARMS_ELEVATED, None)

        # Indicator 3: Head position low
        if has_landmarks:
            indicators['head_low'] = (
                WEIGHT_HEAD_POSITION_LOW,
                float(self._is_head_position_low(landmarks)),
            )
        else:
            indicators['head_low'] = (WEIGHT_HEAD_POSITION_LOW, None)

        # Indicator 4: No breathing motion
        if has_landmarks:
            indicators['no_breathing'] = (
                WEIGHT_NO_BREATHING_MOTION,
                float(self._no_breathing_motion(track_id, landmarks)),
            )
        else:
            indicators['no_breathing'] = (WEIGHT_NO_BREATHING_MOTION, None)

        # Indicator 5: YOLO class
        yolo_val = self._yolo_class_score(yolo_class, yolo_conf)
        indicators['yolo'] = (WEIGHT_YOLO_CLASS, yolo_val)

        # ── Dynamic normalization (only count non-gated indicators) ──────────
        final_score = self._compute_final_score(indicators)

        # ── Layer 2b: Ankle soft signal ─ penalize if likely on dry land ─────
        ankle_penalty_applied = False
        if has_landmarks and self._is_likely_out_of_water(landmarks, track_id):
            final_score *= ANKLE_OUT_OF_WATER_PENALTY
            ankle_penalty_applied = True

        # ── Layer 1A followup: OOW ambiguity penalty ─────────────────────────
        if _oow_ambiguous:
            final_score *= PERSON_OOW_AMBIGUOUS_PENALTY

        logger.debug(
            "Track %s: in_roi=%s oow_ambiguous=%s vertical=%s arms=%s "
            "head_low=%s breathing=%s yolo=%.2f ankle_penalty=%s → score=%.3f",
            track_id,
            _in_water_roi,
            _oow_ambiguous,
            "None" if indicators['vertical'][1] is None else f"{indicators['vertical'][1]:.2f}",
            "None" if indicators['arms_elevated'][1] is None else f"{indicators['arms_elevated'][1]:.2f}",
            "None" if indicators['head_low'][1] is None else f"{indicators['head_low'][1]:.2f}",
            "None" if indicators['no_breathing'][1] is None else f"{indicators['no_breathing'][1]:.2f}",
            indicators['yolo'][1],
            ankle_penalty_applied,
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
            self._head_history[track_id] = deque(maxlen=NO_BREATHING_HISTORY_FRAMES)

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

    def _is_likely_out_of_water(
        self, landmarks: List[Landmark], track_id: str
    ) -> bool:
        """True if the person appears to be standing on dry land.

        Ankle soft signal: if both ankles are clearly visible and positioned
        well below the hips (normal upright standing posture), the person is
        likely on land, not in water.  In water, ankles are typically
        submerged (low visibility) or at hip level.

        Returns False (safe default) when the gate is disabled, landmarks are
        insufficient, or ankle visibility is too low to make a call.
        """
        if not ANKLE_GATE_ENABLED:
            return False

        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        # Both ankles must be clearly visible
        if (left_ankle.visibility < ANKLE_VISIBILITY_MIN
                or right_ankle.visibility < ANKLE_VISIBILITY_MIN):
            return False

        ankle_y_avg = (left_ankle.y + right_ankle.y) / 2.0
        hip_y_avg = (landmarks[23].y + landmarks[24].y) / 2.0

        # Ankles clearly below hips (in normalized ROI coords, larger y = lower)
        if ankle_y_avg > hip_y_avg + ANKLE_HIP_MARGIN:
            logger.debug(
                "Track %s ankle gate triggered — likely on dry land "
                "(ankle_y=%.3f, hip_y=%.3f, margin=%.3f)",
                track_id, ankle_y_avg, hip_y_avg, ANKLE_HIP_MARGIN,
            )
            return True

        return False

    def _is_swimming_but_upright(
        self, landmarks: List[Landmark], yolo_class: str, track_id: str
    ) -> bool:
        """True if YOLO says 'swimming' but body is in upright standing posture.

        Swimmers are horizontal (large angle from vertical). If the body is
        nearly vertical (standing/sitting), the 'swimming' classification is
        almost certainly a false positive from the model.

        Returns False (safe default) when the gate is disabled.
        """
        if not SWIMMING_UPRIGHT_SUPPRESSION:
            return False
        if yolo_class != "swimming":
            return False

        # Compute body angle from vertical (same logic as _is_vertical_orientation)
        shoulder_x = (landmarks[11].x + landmarks[12].x) / 2.0
        shoulder_y = (landmarks[11].y + landmarks[12].y) / 2.0
        hip_x = (landmarks[23].x + landmarks[24].x) / 2.0
        hip_y = (landmarks[23].y + landmarks[24].y) / 2.0

        dx = hip_x - shoulder_x
        dy = hip_y - shoulder_y
        angle_deg = abs(np.degrees(np.arctan2(dx, dy)))

        if angle_deg < SWIMMING_UPRIGHT_ANGLE_MAX:
            logger.debug(
                "Track %s suppressed — YOLO=swimming but body is upright "
                "(angle=%.1f° < %d° threshold)",
                track_id, angle_deg, SWIMMING_UPRIGHT_ANGLE_MAX,
            )
            return True

        return False

    def _is_full_body_visible(
        self, landmarks: List[Landmark], track_id: str
    ) -> bool:
        """True if full lower body is clearly visible (person is on land).

        In actual swimming/drowning, the lower body is submerged and MediaPipe
        reports very low visibility for knees and ankles. If ALL four landmarks
        (both knees + both ankles) are clearly visible, the person is standing
        on dry land.

        Returns False (safe default) when the gate is disabled.
        """
        if not FULL_BODY_VISIBLE_GATE_ENABLED:
            return False

        left_knee = landmarks[25]
        right_knee = landmarks[26]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        all_visible = (
            left_knee.visibility >= FULL_BODY_VISIBILITY_MIN
            and right_knee.visibility >= FULL_BODY_VISIBILITY_MIN
            and left_ankle.visibility >= FULL_BODY_VISIBILITY_MIN
            and right_ankle.visibility >= FULL_BODY_VISIBILITY_MIN
        )

        if all_visible:
            logger.debug(
                "Track %s suppressed — full body visible on land "
                "(knee_vis=%.2f/%.2f, ankle_vis=%.2f/%.2f, threshold=%.2f)",
                track_id,
                left_knee.visibility, right_knee.visibility,
                left_ankle.visibility, right_ankle.visibility,
                FULL_BODY_VISIBILITY_MIN,
            )
            return True

        return False

    def _compute_final_score(self, indicators: Dict[str, tuple]) -> float:
        """Compute final score with dynamic normalization.

        Only counts non-gated (non-None) indicators.
        If arms underwater (visibility < threshold), their indicator is None.
        Denominator shrinks accordingly to prevent penalty.

        FIX R2: When pose estimation returned no landmarks, all pose-based
        indicators are None and only the YOLO class indicator remains.  Allowing
        a YOLO-only score of 1.0 to propagate to the ConfidenceFilter is unsafe
        (a single misclassified frame could sustain the window).  The score is
        capped at POSE_ABSENT_MAX_SCORE (default 0.50) in that case — safely
        below the CONFIDENCE_THRESHOLD (0.70).

        Args:
            indicators: dict of {name: (weight, value_or_None)}

        Returns:
            Normalized score in [0.0, 1.0]
        """
        _POSE_INDICATORS = frozenset({'vertical', 'arms_elevated', 'head_low', 'no_breathing'})

        total_weight = 0.0
        weighted_sum = 0.0
        has_pose_evidence = False

        for name, (weight, value) in indicators.items():
            if value is not None:
                total_weight += weight
                weighted_sum += weight * value
                if name in _POSE_INDICATORS:
                    has_pose_evidence = True

        if total_weight == 0.0:
            return 0.0

        normalized_score = min(1.0, weighted_sum / total_weight)

        # Cap score when pose is absent so YOLO alone cannot fire an alert.
        if not has_pose_evidence:
            if normalized_score > POSE_ABSENT_MAX_SCORE:
                logger.debug(
                    "Score capped %.3f → %.3f (pose absent — YOLO-only evidence)",
                    normalized_score, POSE_ABSENT_MAX_SCORE,
                )
                normalized_score = POSE_ABSENT_MAX_SCORE

        return normalized_score

    def cleanup_stale_tracks(self, active_track_ids: Iterable[str]) -> None:
        """Drop per-track history for IDs not present in the current frame."""
        active = set(active_track_ids)
        stale_ids = [track_id for track_id in self._head_history if track_id not in active]
        for track_id in stale_ids:
            self._head_history.pop(track_id, None)
