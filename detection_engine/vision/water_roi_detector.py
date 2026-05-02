"""Water ROI auto-detector — find the pool surface using HSV color segmentation.

Designed for cameras that may be repositioned. Runs at startup and optionally
re-calibrates periodically. Uses dual HSV ranges to catch pool water under
varying lighting conditions (daylight, overcast, artificial lighting).

Usage:
    from detection_engine.vision.water_roi_detector import detect_water_roi

    polygon = detect_water_roi(frame)
    if polygon is not None:
        behavior_analyzer.set_water_roi(polygon)
"""
import logging
import os
from typing import List, Optional

import cv2
import numpy as np

from config.settings import WATER_ROI_MIN_AREA_RATIO

logger = logging.getLogger(__name__)

# ── HSV ranges for pool water detection ───────────────────────────────────────
# Range 1: Standard blue/cyan pool water (indoor/outdoor)
_HSV_LOWER_1 = np.array([85, 30, 30])
_HSV_UPPER_1 = np.array([130, 255, 255])

# Range 2: Lighter turquoise/teal in bright sunlight
_HSV_LOWER_2 = np.array([75, 20, 100])
_HSV_UPPER_2 = np.array([100, 200, 255])

# Range 3: Greenish pool water (some pools, ponds)
_HSV_LOWER_3 = np.array([60, 25, 50])
_HSV_UPPER_3 = np.array([85, 255, 255])

# Morphological kernel for noise cleanup
_MORPH_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
_MORPH_KERNEL_SMALL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))


def detect_water_roi(
    frame: np.ndarray,
    debug_save_path: Optional[str] = None,
) -> Optional[List[List[int]]]:
    """Detect the pool water surface in a camera frame.

    Uses HSV color segmentation with multiple ranges to find the largest
    blue/cyan/turquoise region (pool water).

    Args:
        frame: BGR numpy array from the camera.
        debug_save_path: If set, save a debug preview image to this path.

    Returns:
        List of [x, y] polygon vertices in pixel coordinates, or None
        if no valid water region was detected.
    """
    if frame is None or frame.size == 0:
        logger.warning("Water ROI detection: empty frame")
        return None

    height, width = frame.shape[:2]
    min_area = width * height * WATER_ROI_MIN_AREA_RATIO

    # Convert to HSV
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Apply all three HSV ranges and combine
    mask1 = cv2.inRange(hsv, _HSV_LOWER_1, _HSV_UPPER_1)
    mask2 = cv2.inRange(hsv, _HSV_LOWER_2, _HSV_UPPER_2)
    mask3 = cv2.inRange(hsv, _HSV_LOWER_3, _HSV_UPPER_3)
    mask = cv2.bitwise_or(mask1, cv2.bitwise_or(mask2, mask3))

    # Morphological operations to clean up the mask
    # Close: fill small gaps inside the water region
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _MORPH_KERNEL, iterations=3)
    # Open: remove small noise blobs outside the water
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _MORPH_KERNEL_SMALL, iterations=2)

    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        logger.info("Water ROI detection: no water-colored regions found")
        _save_debug_image(frame, mask, None, debug_save_path)
        return None

    # Find the largest contour by area
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)

    if area < min_area:
        logger.info(
            "Water ROI detection: largest region too small (%.0f px² < %.0f px² min)",
            area, min_area,
        )
        _save_debug_image(frame, mask, None, debug_save_path)
        return None

    # Simplify contour to a polygon (epsilon = 1% of perimeter)
    perimeter = cv2.arcLength(largest, True)
    epsilon = 0.01 * perimeter
    approx = cv2.approxPolyDP(largest, epsilon, True)

    # Convert to [[x, y], ...] format
    polygon = approx.reshape(-1, 2).tolist()

    # Ensure polygon has at least 3 vertices
    if len(polygon) < 3:
        logger.info("Water ROI detection: polygon too simple (%d vertices)", len(polygon))
        _save_debug_image(frame, mask, None, debug_save_path)
        return None

    coverage_pct = (area / (width * height)) * 100
    logger.info(
        "Water ROI auto-detected: %d vertices, area=%.0f px² (%.1f%% of frame)",
        len(polygon), area, coverage_pct,
    )

    _save_debug_image(frame, mask, polygon, debug_save_path)
    return polygon


def detect_water_roi_multi_frame(
    frames: List[np.ndarray],
    debug_save_path: Optional[str] = None,
) -> Optional[List[List[int]]]:
    """Run detection on multiple frames and return the best result.

    Takes the detection with the largest water area for robustness
    against transient occlusions or bad frames.

    Args:
        frames: List of BGR numpy arrays.
        debug_save_path: If set, save debug preview for the best frame.

    Returns:
        Best polygon or None if no frame yielded a valid detection.
    """
    best_polygon = None
    best_area = 0.0

    for i, frame in enumerate(frames):
        if frame is None or frame.size == 0:
            continue

        polygon = detect_water_roi(frame, debug_save_path=None)
        if polygon is None:
            continue

        # Calculate area of this polygon
        pts = np.array(polygon, dtype=np.float32)
        area = cv2.contourArea(pts)

        if area > best_area:
            best_area = area
            best_polygon = polygon
            best_frame = frame

    if best_polygon is not None and debug_save_path:
        # Re-run on the best frame to save the debug image
        height, width = best_frame.shape[:2]
        hsv = cv2.cvtColor(best_frame, cv2.COLOR_BGR2HSV)
        mask1 = cv2.inRange(hsv, _HSV_LOWER_1, _HSV_UPPER_1)
        mask2 = cv2.inRange(hsv, _HSV_LOWER_2, _HSV_UPPER_2)
        mask3 = cv2.inRange(hsv, _HSV_LOWER_3, _HSV_UPPER_3)
        mask = cv2.bitwise_or(mask1, cv2.bitwise_or(mask2, mask3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _MORPH_KERNEL, iterations=3)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _MORPH_KERNEL_SMALL, iterations=2)
        _save_debug_image(best_frame, mask, best_polygon, debug_save_path)

    return best_polygon


def _save_debug_image(
    frame: np.ndarray,
    mask: np.ndarray,
    polygon: Optional[List[List[int]]],
    save_path: Optional[str],
) -> None:
    """Save a debug preview showing the detection result."""
    if save_path is None:
        return

    try:
        preview = frame.copy()
        height, width = preview.shape[:2]

        # Overlay the mask as semi-transparent blue
        mask_color = np.zeros_like(preview)
        mask_color[mask > 0] = (255, 150, 0)  # Blue overlay for detected water
        preview = cv2.addWeighted(preview, 0.7, mask_color, 0.3, 0)

        if polygon is not None:
            # Draw the final polygon
            pts = np.array(polygon, dtype=np.int32).reshape(-1, 1, 2)
            cv2.polylines(preview, [pts], isClosed=True, color=(0, 255, 0), thickness=3)

            # Label vertices
            for i, (px, py) in enumerate(polygon):
                cv2.circle(preview, (int(px), int(py)), 5, (0, 255, 0), -1)

            area = cv2.contourArea(np.array(polygon, dtype=np.float32))
            coverage_pct = (area / (width * height)) * 100
            status_text = f"WATER ROI DETECTED: {len(polygon)} vertices, {coverage_pct:.1f}% coverage"
            status_color = (0, 255, 0)
        else:
            status_text = "NO WATER ROI DETECTED"
            status_color = (0, 0, 255)

        cv2.putText(
            preview, status_text, (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2, cv2.LINE_AA,
        )
        cv2.putText(
            preview, "AquaGuard Water ROI Auto-Detection", (10, height - 15),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA,
        )

        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        cv2.imwrite(save_path, preview)
        logger.info("Water ROI debug preview saved: %s", save_path)
    except (OSError, cv2.error) as exc:
        logger.warning("Failed to save water ROI debug image: %s", exc)
