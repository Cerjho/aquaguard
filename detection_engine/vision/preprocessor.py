"""Frame preprocessor — resize and normalize frames for YOLO inference."""
import numpy as np
import cv2


def preprocess(frame: np.ndarray) -> np.ndarray:
    """Resize frame to 640×640, convert BGR→RGB, normalize to float32 [0,1].

    Args:
        frame: Input BGR frame from OpenCV capture.

    Returns:
        Float32 numpy array of shape (640, 640, 3) with values in [0.0, 1.0].
    """
    resized = cv2.resize(frame, (640, 640), interpolation=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    normalized = rgb.astype(np.float32) / 255.0
    return normalized
