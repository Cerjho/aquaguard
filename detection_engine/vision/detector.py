"""YOLOv11s drowning detector — one instance per camera zone."""
import logging
import os
import time
from typing import List

import numpy as np
import torch
from ultralytics import YOLO
from ultralytics.utils import LOGGER as ULTRALYTICS_LOGGER

from config.settings import (
    CUDA_OOM_COOLDOWN_SECONDS,
    CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE,
    CUDA_UNKNOWN_ERROR_RESET_SECONDS,
    YOLO_CONFIDENCE_THRESHOLD,
    YOLO_IMGSZ,
    YOLO_MIN_BBOX_AREA,
)
from detection_engine.models_data.detection import Detection

logger = logging.getLogger(__name__)

# Map YOLO class index → human-readable label
CLASS_MAP = {
    0: "drowning",
    1: "swimming",
    2: "person_out_of_water",
}


class _UltralyticsNoiseFilter(logging.Filter):
    """Drop repetitive third-party warnings that do not affect outcomes."""

    _NOISY_MESSAGE_FRAGMENTS = (
        "NMS time limit",
        "not enough matching points",
    )

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return not any(fragment in message for fragment in self._NOISY_MESSAGE_FRAGMENTS)


def _install_ultralytics_noise_filter() -> None:
    if any(
        isinstance(active_filter, _UltralyticsNoiseFilter)
        for active_filter in ULTRALYTICS_LOGGER.filters
    ):
        return
    ULTRALYTICS_LOGGER.addFilter(_UltralyticsNoiseFilter())


_install_ultralytics_noise_filter()


class DrowningDetector:
    """Wraps YOLOv11s for drowning detection with ByteTrack state per zone.

    CRITICAL: Each instance maintains its own ByteTrack tracking state.
    Never share a single DrowningDetector across multiple cameras.
    Instantiate one DrowningDetector per camera zone in main.py.
    """

    def __init__(self, model_path: str):
        """Load YOLOv11s model and assign to CUDA (falls back to CPU if unavailable).

        Args:
            model_path: Path to .pt weights file.
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._cuda_oom_cooldown_until = 0.0
        self._cuda_unknown_error_count = 0
        self._cuda_unknown_error_window_start = 0.0
        logger.info("Loading YOLOv11s from %s on device=%s", model_path, self.device)
        self.model = YOLO(model_path, task='detect')
        # Warm up to ensure device is assigned
        logger.info("DrowningDetector ready on %s", self.device)

    def _track_inference(self, frame: np.ndarray, device: str):
        return self.model.track(
            frame,
            persist=True,
            conf=YOLO_CONFIDENCE_THRESHOLD,
            imgsz=YOLO_IMGSZ,
            device=device,
            tracker="bytetrack.yaml",
            verbose=False,
        )

    def _record_cuda_unknown_error(self) -> bool:
        now = time.monotonic()
        if (
            now - self._cuda_unknown_error_window_start
        ) > CUDA_UNKNOWN_ERROR_RESET_SECONDS:
            self._cuda_unknown_error_window_start = now
            self._cuda_unknown_error_count = 0
        self._cuda_unknown_error_count += 1
        return self._cuda_unknown_error_count >= CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE

    def _reset_cuda_unknown_error_state(self) -> None:
        if self._cuda_unknown_error_count:
            self._cuda_unknown_error_count = 0
            self._cuda_unknown_error_window_start = 0.0

    def _run_cpu_fallback(self, frame: np.ndarray):
        try:
            return self._track_inference(frame, "cpu")
        except (RuntimeError, ValueError, TypeError, AttributeError) as exc:
            logger.error("CPU fallback also failed: %s", exc)
            return []

    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Run tracking inference on a single frame.

        Args:
            frame: BGR numpy array from OpenCV.

        Returns:
            List of Detection objects; empty list on failure.
        """
        run_device = self.device
        now = time.monotonic()
        cooldown_until = getattr(self, "_cuda_oom_cooldown_until", 0.0)
        if self.device == "cuda" and now < cooldown_until:
            run_device = "cpu"

        had_cuda_failure = False

        try:
            results = self._track_inference(frame, run_device)
        except RuntimeError as exc:
            message = str(exc).lower()
            is_unknown_error = "unknown error" in message
            if run_device == "cuda" and ("out of memory" in message or is_unknown_error):
                had_cuda_failure = True
                if is_unknown_error and self._record_cuda_unknown_error():
                    logger.critical(
                        "CUDA context appears corrupted after %d consecutive "
                        "unknown errors. Forcing process restart.",
                        self._cuda_unknown_error_count,
                    )
                    os._exit(1)
                logger.error("CUDA failure - falling back to CPU for this frame: %s", exc)
                self._handle_cuda_oom()
                results = self._run_cpu_fallback(frame)
                if results == []:
                    return []
            else:
                logger.error("Inference error: %s", exc)
                return []
        except (RuntimeError, ValueError, TypeError, AttributeError) as exc:
            logger.error("Unexpected inference error: %s", exc)
            return []

        if run_device == "cuda" and not had_cuda_failure:
            self._reset_cuda_unknown_error_state()

        detections: List[Detection] = []
        for result in results:
            if result.boxes is None:
                continue
            boxes = result.boxes
            for i in range(len(boxes)):
                track_id = boxes.id
                if track_id is None:
                    continue  # skip detections without a track ID
                tid = str(int(track_id[i].item()))
                cls_idx = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                xyxy = boxes.xyxy[i].tolist()
                label = CLASS_MAP.get(cls_idx, "unknown")

                # FIX 6: Skip tiny person_out_of_water bboxes (noise at distance)
                # Drowning and swimming detections are never filtered by size.
                bbox_area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                if label == "person_out_of_water" and bbox_area < YOLO_MIN_BBOX_AREA:
                    continue

                detections.append(
                    Detection(
                        track_id=tid,
                        class_label=label,
                        confidence=conf,
                        bbox=(xyxy[0], xyxy[1], xyxy[2], xyxy[3]),
                    )
                )
        return detections

    def _handle_cuda_oom(self) -> None:
        """Best-effort CUDA cleanup and temporary cooldown after OOM."""
        if not torch.cuda.is_available():
            return
        try:
            torch.cuda.empty_cache()
        except RuntimeError as exc:
            logger.debug("torch.cuda.empty_cache failed: %s", exc)
        try:
            torch.cuda.synchronize()
        except RuntimeError as exc:
            logger.debug("torch.cuda.synchronize failed: %s", exc)
        # Prevent immediate repeated CUDA retries after OOM storm.
        self._cuda_oom_cooldown_until = time.monotonic() + CUDA_OOM_COOLDOWN_SECONDS
