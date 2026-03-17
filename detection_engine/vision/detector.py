"""YOLOv11s drowning detector — one instance per camera zone."""
import logging
from typing import List

import numpy as np
import torch
from ultralytics import YOLO

from detection_engine.models_data.detection import Detection

logger = logging.getLogger(__name__)

# Map YOLO class index → human-readable label
CLASS_MAP = {
    0: "drowning",
    1: "swimming",
    2: "person_out_of_water",
}


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
        logger.info("Loading YOLOv11s from %s on device=%s", model_path, self.device)
        self.model = YOLO(model_path)
        # Warm up to ensure device is assigned
        logger.info("DrowningDetector ready on %s", self.device)

    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Run tracking inference on a single frame.

        Args:
            frame: BGR numpy array from OpenCV.

        Returns:
            List of Detection objects; empty list on failure.
        """
        try:
            results = self.model.track(
                frame,
                persist=True,
                conf=0.4,
                device=self.device,
                verbose=False,
            )
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.error("CUDA OOM — falling back to CPU for this frame: %s", exc)
                try:
                    results = self.model.track(
                        frame,
                        persist=True,
                        conf=0.4,
                        device="cpu",
                        verbose=False,
                    )
                except Exception as cpu_exc:
                    logger.error("CPU fallback also failed: %s", cpu_exc)
                    return []
            else:
                logger.error("Inference error: %s", exc)
                return []
        except Exception as exc:
            logger.error("Unexpected inference error: %s", exc)
            return []

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
                detections.append(
                    Detection(
                        track_id=tid,
                        class_label=label,
                        confidence=conf,
                        bbox=(xyxy[0], xyxy[1], xyxy[2], xyxy[3]),
                    )
                )
        return detections
