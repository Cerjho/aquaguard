"""Pose estimator — MediaPipe pose landmark extraction with ROI cropping."""
import logging
import os
import time
from contextlib import contextmanager
from typing import List, Optional, Tuple

import cv2
import numpy as np
import mediapipe as mp

from detection_engine.models_data.landmark import Landmark

logger = logging.getLogger(__name__)
_NATIVE_INIT_LOG_FLUSH_DELAY_SECONDS = 2.5
_NATIVE_PROCESS_LOG_FLUSH_DELAY_SECONDS = 0.35


@contextmanager
def _silence_native_stdio():
    """Temporarily redirect process stdout/stderr to os.devnull.

    MediaPipe/TFLite native layers can write directly to file descriptors,
    bypassing Python logging and warnings filters.
    """
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    stdout_fd = os.dup(1)
    stderr_fd = os.dup(2)
    try:
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        yield
    finally:
        os.dup2(stdout_fd, 1)
        os.dup2(stderr_fd, 2)
        os.close(stdout_fd)
        os.close(stderr_fd)
        os.close(devnull_fd)


def _create_pose_runner():
    """Construct MediaPipe pose while suppressing known native init noise."""
    with _silence_native_stdio():
        pose_runner = mp.solutions.pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        time.sleep(_NATIVE_INIT_LOG_FLUSH_DELAY_SECONDS)
        return pose_runner


def _run_pose_process_silenced(pose_runner, roi_rgb):
    """Run the first MediaPipe process call with stdout/stderr muted."""
    with _silence_native_stdio():
        result = pose_runner.process(roi_rgb)
        time.sleep(_NATIVE_PROCESS_LOG_FLUSH_DELAY_SECONDS)
        return result


class PoseEstimator:
    """Extracts MediaPipe pose landmarks from a cropped bounding box ROI.

    Landmark coordinates are NORMALIZED to [0.0, 1.0] — never treat them as pixels.
    """

    def __init__(self):
        self._pose = _create_pose_runner()
        self._suppress_first_process_noise = True

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
            use_silenced_process = bool(
                getattr(self, "_suppress_first_process_noise", False)
            )
            self._suppress_first_process_noise = False
            if use_silenced_process:
                results = _run_pose_process_silenced(self._pose, roi_rgb)
            else:
                results = self._pose.process(roi_rgb)
        except (RuntimeError, ValueError, cv2.error) as exc:
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
