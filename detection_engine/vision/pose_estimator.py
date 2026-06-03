"""Pose estimator — YOLO-Pose GPU landmark extraction."""
import logging
from typing import List, Optional, Tuple

import numpy as np
import torch
from ultralytics import YOLO

from detection_engine.models_data.landmark import Landmark

logger = logging.getLogger(__name__)

MAP_YOLO_TO_MP = {
    0: 0,   # Nose
    5: 11,  # Left Shoulder
    6: 12,  # Right Shoulder
    9: 15,  # Left Wrist
    10: 16, # Right Wrist
    11: 23, # Left Hip
    12: 24, # Right Hip
    13: 25, # Left Knee
    14: 26, # Right Knee
    15: 27, # Left Ankle
    16: 28  # Right Ankle
}


class PoseEstimator:
    """Extracts pose landmarks using YOLO-Pose on the GPU.

    Landmark coordinates are normalized to [0.0, 1.0] relative to the matched bbox
    to perfectly emulate MediaPipe's output format for the BehaviorAnalyzer.
    """

    def __init__(self, model_path: str = "detection_engine/models/yolov8n-pose.pt"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading YOLO-Pose from %s on device=%s", model_path, self.device)
        self.model = YOLO(model_path, task='pose')
        # Warmup
        dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model.predict(dummy_frame, device=self.device, verbose=False)
        logger.info("PoseEstimator ready on %s", self.device)

    def predict_frame(self, frame: np.ndarray):
        """Run YOLO-Pose on the full frame.
        
        Returns the ultralytics Results object containing all poses.
        """
        # verbose=False to suppress print output per frame
        return self.model.predict(frame, device=self.device, verbose=False)

    def estimate_from_results(
        self,
        pose_results: list,
        bbox: Tuple[float, float, float, float]
    ) -> Optional[List[Landmark]]:
        """Find the matching pose from the full-frame results and return normalized landmarks.

        Args:
            pose_results: The list returned by `predict_frame`.
            bbox: The target (x1, y1, x2, y2) bounding box to match against.

        Returns:
            List of 33 Landmark objects with normalized [0,1] coords,
            or None if no matching pose was found.
        """
        if not pose_results or len(pose_results) == 0:
            return None

        result = pose_results[0]
        if result.boxes is None or result.keypoints is None or len(result.boxes) == 0:
            return None

        best_iou = 0.0
        best_idx = -1
        
        # Find the pose box with the highest IoU to our tracked bbox
        boxes = result.boxes.xyxy.cpu().numpy()
        for i, b in enumerate(boxes):
            match_score = self._calculate_match_score(bbox, b)
            if match_score > best_iou:
                best_iou = match_score
                best_idx = i

        if best_idx == -1 or best_iou < 0.1:
            return None

        # Extract the keypoints for the matched person
        # keypoints.data shape is (num_det, 17, 3) -> [x, y, conf]
        kp = result.keypoints.data.cpu().numpy()[best_idx]
        
        # Use the matched pose box to normalize the coordinates, NOT the tracked bbox.
        # This prevents aspect ratio distortion when the tracked bbox is tiny (e.g. head only).
        matched_box = boxes[best_idx]
        target_x1, target_y1, target_x2, target_y2 = matched_box
        target_w = max(1e-5, float(target_x2 - target_x1))
        target_h = max(1e-5, float(target_y2 - target_y1))

        # Build the 33-landmark array expected by BehaviorAnalyzer
        landmarks = []
        for i in range(33):
            landmarks.append(Landmark(x=0.0, y=0.0, z=0.0, visibility=0.0))

        for yolo_idx, mp_idx in MAP_YOLO_TO_MP.items():
            px, py, conf = kp[yolo_idx]
            
            # Normalize coordinates relative to the tracked bbox to match MediaPipe
            norm_x = (px - target_x1) / target_w
            norm_y = (py - target_y1) / target_h
            
            landmarks[mp_idx] = Landmark(
                x=float(norm_x),
                y=float(norm_y),
                z=0.0,
                visibility=float(conf)
            )

        return landmarks

    def _calculate_match_score(self, boxA, boxB) -> float:
        """Calculate Intersection over Minimum Area (IoM).
        
        This is crucial because the finetuned YOLO often predicts tiny bounding boxes
        (just the head/shoulders of a swimmer), while YOLO-Pose predicts full-body boxes.
        Standard IoU would be extremely low (~0.05) causing pose matches to fail.
        IoM ensures that if the head box is inside the full body box, it matches.
        """
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0.0, float(xB - xA)) * max(0.0, float(yB - yA))
        if interArea == 0.0:
            return 0.0

        boxAArea = float(boxA[2] - boxA[0]) * float(boxA[3] - boxA[1])
        boxBArea = float(boxB[2] - boxB[0]) * float(boxB[3] - boxB[1])
        
        minArea = min(boxAArea, boxBArea)
        if minArea == 0.0:
            return 0.0
            
        return interArea / minArea
