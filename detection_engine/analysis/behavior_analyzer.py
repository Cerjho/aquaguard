"""Behavior analyzer — water-level drowning detection with 8 indicators + dynamic normalization."""
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
    WEIGHT_NO_LIMB_MOTION,
    WEIGHT_FACE_SUBMERGED,
    WEIGHT_SPLASHING,
    WEIGHT_YOLO_CLASS,
    VERTICAL_ANGLE_THRESHOLD_DEG,
    HEAD_LOW_THRESHOLD,
    LIMB_MOTION_HISTORY_FRAMES,
    LIMB_MOTION_MIN_HISTORY_FRAMES,
    LIMB_MOTION_STD_THRESHOLD,
    FACE_VISIBILITY_THRESHOLD,
    SPLASHING_HISTORY_FRAMES,
    SPLASHING_DELTA_THRESHOLD,
    SPLASHING_MIN_CONSECUTIVE,
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

    Water-level tuned with 8 indicators:
    1. Vertical orientation (body upright)
    2. Arms elevated (panic response)
    3. Head position low (head stuck at water line)  ← NEW
    4. No breathing motion (no head bobbing)         ← NEW
    5. No limb motion (low wrist/ankle variance)
    6. Face submerged (low face visibility)
    7. Consecutive splashing (rapid limb motion)
    8. YOLO class ("drowning" classification)

    All scores normalized dynamically based on visibility gating.
    """

    def __init__(self):
        # Per-track head position history for breathing detection
        self._head_history: Dict[str, deque] = {}
        # Per-track limb position history for stillness detection
        self._limb_history: Dict[str, deque] = {}
        # Per-track deltas for consecutive splashing detection
        self._splash_delta_history: Dict[str, deque] = {}
        self._splash_last_positions: Dict[str, tuple] = {}

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

        # ── Evaluate all 8 indicators ─────────────────────────────────────────
        indicators = {}

        # Indicator 1: Vertical orientation
        if has_landmarks:
            indicators['vertical'] = (
                WEIGHT_VERTICAL_ORIENTATION,
                float(self._is_vertical_orientation(landmarks)),
            )
        else:
            indicators['vertical'] = (WEIGHT_VERTICAL_ORIENTATION, None)

        # Indicator 2: Arms elevated (at least one wrist visible and raised)
        left_wrist_visible = landmarks[15].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD
        right_wrist_visible = landmarks[16].visibility >= LIMB_VISIBILITY_MIN_THRESHOLD
        if has_landmarks and (left_wrist_visible or right_wrist_visible):
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

        # Indicator 5: No limb motion
        if has_landmarks:
            limb_still = self._no_limb_motion(track_id, landmarks)
            indicators['no_limb_motion'] = (
                WEIGHT_NO_LIMB_MOTION,
                None if limb_still is None else float(limb_still),
            )
        else:
            indicators['no_limb_motion'] = (WEIGHT_NO_LIMB_MOTION, None)

        # Indicator 6: Face submerged
        if has_landmarks:
            indicators['face_submerged'] = (
                WEIGHT_FACE_SUBMERGED,
                float(self._is_face_submerged(landmarks)),
            )
        else:
            indicators['face_submerged'] = (WEIGHT_FACE_SUBMERGED, None)

        # Indicator 7: Consecutive splashing
        if has_landmarks:
            splashing = self._is_consecutive_splashing(track_id, landmarks)
            indicators['splashing'] = (
                WEIGHT_SPLASHING,
                None if splashing is None else float(splashing),
            )
        else:
            indicators['splashing'] = (WEIGHT_SPLASHING, None)

        # Indicator 8: YOLO class
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
            "head_low=%s breathing=%s limb_still=%s face_sub=%s splash=%s "
            "yolo=%.2f ankle_penalty=%s → score=%.3f",
            track_id,
            _in_water_roi,
            _oow_ambiguous,
            "None" if indicators['vertical'][1] is None else f"{indicators['vertical'][1]:.2f}",
            "None" if indicators['arms_elevated'][1] is None else f"{indicators['arms_elevated'][1]:.2f}",
            "None" if indicators['head_low'][1] is None else f"{indicators['head_low'][1]:.2f}",
            "None" if indicators['no_breathing'][1] is None else f"{indicators['no_breathing'][1]:.2f}",
            "None" if indicators['no_limb_motion'][1] is None else f"{indicators['no_limb_motion'][1]:.2f}",
            "None" if indicators['face_submerged'][1] is None else f"{indicators['face_submerged'][1]:.2f}",
            "None" if indicators['splashing'][1] is None else f"{indicators['splashing'][1]:.2f}",
            indicators['yolo'][1],
            ankle_penalty_applied,
            final_score,
        )

        return final_score

    # ── Private indicator methods ─────────────────────────────────────────────

    def _is_vertical_orientation(self, landmarks: List[Landmark]) -> bool:
        """True if body is in a non-swimming (danger) posture.

        Covers two dangerous scenarios:
        - ACTIVE DROWNING: body vertical/upright (head at surface, arms raised)
          → angle near 0° from vertical
        - PASSIVE/UNCONSCIOUS FLOAT: body prone/horizontal (face-down float)
          → angle near 90° from vertical

        Normal swimming is typically in the 30°–70° range (body tilted but
        propelling forward). Both extremes (near 0° and near 90°) are danger
        signals.  Returns True for angles < VERTICAL_ANGLE_THRESHOLD_DEG
        (active drowning) OR angles > (90° - VERTICAL_ANGLE_THRESHOLD_DEG)
        (prone float, e.g. face-down unconscious in water).
        """
        shoulder_x = (landmarks[11].x + landmarks[12].x) / 2.0
        shoulder_y = (landmarks[11].y + landmarks[12].y) / 2.0
        hip_x = (landmarks[23].x + landmarks[24].x) / 2.0
        hip_y = (landmarks[23].y + landmarks[24].y) / 2.0

        dx = hip_x - shoulder_x
        dy = hip_y - shoulder_y  # y increases downward in image coords

        # Angle from vertical (0°=upright/active drown, 90°=horizontal/prone float)
        angle_deg = abs(np.degrees(np.arctan2(dx, dy)))

        is_active_drowning = angle_deg < VERTICAL_ANGLE_THRESHOLD_DEG
        # Prone float: body nearly horizontal (face-down, motionless)
        is_prone_float = angle_deg > (90.0 - VERTICAL_ANGLE_THRESHOLD_DEG)
        return is_active_drowning or is_prone_float

    def _are_arms_elevated(self, landmarks: List[Landmark]) -> bool:
        """True if at least one wrist is raised above its shoulder (panic/distress signal).

        CRITICAL: The instinctive drowning response raises only ONE arm above
        water — the person cannot voluntarily control both arms while fighting
        to keep their head above the surface.  Requiring BOTH wrists elevated
        caused a miss on the most common active-drowning posture (head
        submerging, single arm waving above water).

        Returns True if EITHER wrist is clearly above its corresponding shoulder.
        The individual wrist visibility gate in analyze() ensures we only
        evaluate wrists that MediaPipe can actually see.
        """
        left_wrist_above = landmarks[15].y < landmarks[11].y   # left wrist above left shoulder
        right_wrist_above = landmarks[16].y < landmarks[12].y  # right wrist above right shoulder
        # OR — either arm raised counts as a distress signal
        return left_wrist_above or right_wrist_above

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

    def _no_limb_motion(
        self, track_id: str, landmarks: List[Landmark]
    ) -> Optional[bool]:
        """True if wrists and ankles show minimal motion across history."""
        left_wrist = landmarks[15]
        right_wrist = landmarks[16]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        if (
            left_wrist.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or right_wrist.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or left_ankle.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or right_ankle.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
        ):
            return None

        if track_id not in self._limb_history:
            self._limb_history[track_id] = deque(
                maxlen=LIMB_MOTION_HISTORY_FRAMES
            )

        self._limb_history[track_id].append(
            (left_wrist.x, right_wrist.x, left_ankle.x, right_ankle.x)
        )

        if len(self._limb_history[track_id]) < LIMB_MOTION_MIN_HISTORY_FRAMES:
            return None

        history = np.array(self._limb_history[track_id], dtype=np.float32)
        max_std = float(np.max(np.std(history, axis=0)))
        return max_std < LIMB_MOTION_STD_THRESHOLD

    def _is_face_submerged(self, landmarks: List[Landmark]) -> bool:
        """True if face visibility is low (likely submerged)."""
        return landmarks[0].visibility < FACE_VISIBILITY_THRESHOLD

    def _is_consecutive_splashing(
        self, track_id: str, landmarks: List[Landmark]
    ) -> Optional[bool]:
        """True if rapid limb motion is sustained for consecutive frames."""
        left_wrist = landmarks[15]
        right_wrist = landmarks[16]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        if (
            left_wrist.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or right_wrist.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or left_ankle.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
            or right_ankle.visibility < LIMB_VISIBILITY_MIN_THRESHOLD
        ):
            self._splash_last_positions.pop(track_id, None)
            return None

        positions = (
            left_wrist.y,
            right_wrist.y,
            left_ankle.y,
            right_ankle.y,
        )
        last = self._splash_last_positions.get(track_id)
        self._splash_last_positions[track_id] = positions
        if last is None:
            return None

        deltas = [abs(curr - prev) for curr, prev in zip(positions, last)]
        max_delta = float(max(deltas))
        history = self._splash_delta_history.setdefault(
            track_id, deque(maxlen=SPLASHING_HISTORY_FRAMES)
        )
        history.append(max_delta)

        if len(history) < SPLASHING_MIN_CONSECUTIVE:
            return None

        max_run = 0
        current = 0
        for delta in history:
            if delta >= SPLASHING_DELTA_THRESHOLD:
                current += 1
                max_run = max(max_run, current)
            else:
                current = 0

        return max_run >= SPLASHING_MIN_CONSECUTIVE

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
        _POSE_INDICATORS = frozenset(
            {
                'vertical',
                'arms_elevated',
                'head_low',
                'no_breathing',
                'no_limb_motion',
                'face_submerged',
                'splashing',
            }
        )

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
        stale_ids = [
            track_id for track_id in self._head_history if track_id not in active
        ]
        for track_id in stale_ids:
            self._head_history.pop(track_id, None)

        stale_limb_ids = [
            track_id for track_id in self._limb_history if track_id not in active
        ]
        for track_id in stale_limb_ids:
            self._limb_history.pop(track_id, None)

        stale_splash_ids = [
            track_id for track_id in self._splash_delta_history if track_id not in active
        ]
        for track_id in stale_splash_ids:
            self._splash_delta_history.pop(track_id, None)
            self._splash_last_positions.pop(track_id, None)
