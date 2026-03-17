"""Pose estimator — MediaPipe pose landmark extraction with ROI cropping."""
import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np
import mediapipe as mp

from detection_engine.models_data.landmark import Landmark

logger = logging.getLogger(__name__)


class PoseEstimator:
    """Extracts MediaPipe pose landmarks from a cropped bounding box ROI.

    Landmark coordinates are NORMALIZED to [0.0, 1.0] — never treat them as pixels.
    """

    def __init__(self):
        self._pose = mp.solutions.pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def estimate(
        self,
        frame: np.ndarray,
        bbox: Tuple[float, float, float, float],
    ) -> Optional[List[Landmark]]:
        """Crop ROI from frame and run MediaPipe pose estimation.

        Args:
            frame: Full BGR frame from camera.
            bbox:  (x1, y1, x2, y2) bounding box in pixel coordinates.

        Returns:
            List of 33 Landmark objects with normalized [0,1] coords,
            or None if pose could not be estimated.
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = bbox

        # Clamp bbox to frame boundaries
        x1 = max(0, int(x1))
        y1 = max(0, int(y1))
        x2 = min(w, int(x2))
        y2 = min(h, int(y2))

        if x2 <= x1 or y2 <= y1:
            logger.warning("Invalid bbox after clamping: %s", bbox)
            return None

        roi = frame[y1:y2, x1:x2]
        roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)

        try:
            results = self._pose.process(roi_rgb)
        except Exception as exc:
            logger.error("MediaPipe pose.process failed: %s", exc)
            return None

        if results.pose_landmarks is None:
            return None

        landmarks = [
            Landmark(
                x=lm.x,
                y=lm.y,
                z=lm.z,
                visibility=lm.visibility,
            )
            for lm in results.pose_landmarks.landmark
        ]
        return landmarks
