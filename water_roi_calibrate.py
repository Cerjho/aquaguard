"""Water ROI calibration — capture a frame and suggest a pool polygon."""
import cv2
import numpy as np
import os
import sys
import time

RTSP_URL = "rtsp://admin123:admin123@192.168.1.20:554/stream1"
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
RAW_PATH = os.path.join(PROJECT_ROOT, "water_roi_calibration.jpg")
PREVIEW_PATH = os.path.join(PROJECT_ROOT, "water_roi_preview.jpg")

# Force TCP transport for reliability
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'

print(f"Connecting to RTSP stream: rtsp://****:****@192.168.1.20:554/stream1")
print("(TCP transport, timeout 15s)")

cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("ERROR: Failed to open RTSP stream")
    sys.exit(1)

# Grab a few frames to let the decoder stabilize
for _ in range(5):
    ret, frame = cap.read()
    if not ret:
        time.sleep(0.5)

ret, frame = cap.read()
cap.release()

if not ret or frame is None:
    print("ERROR: Failed to capture a frame")
    sys.exit(1)

h, w = frame.shape[:2]
print(f"Frame captured: {w}x{h}")

# Save raw calibration frame
cv2.imwrite(RAW_PATH, frame)
print(f"Raw frame saved: {RAW_PATH}")

# Suggest a rectangle covering the likely pool area
# For a surface-mounted TC65 looking down at a pool:
# - Pool water typically occupies the central/lower portion of the frame
# - Leave margins for deck/surroundings
margin_x = int(w * 0.05)   # 5% margin on each side
margin_top = int(h * 0.15)  # 15% margin top (sky/ceiling/deck edge)
margin_bot = int(h * 0.05)  # 5% margin bottom

polygon = [
    [margin_x, margin_top],                # top-left
    [w - margin_x, margin_top],            # top-right
    [w - margin_x, h - margin_bot],        # bottom-right
    [margin_x, h - margin_bot],            # bottom-left
]

print(f"\n{'='*60}")
print("SUGGESTED WATER_ROI polygon (pixel coordinates):")
print(f"  {polygon}")
print(f"{'='*60}")
print(f"  Top-left:     ({polygon[0][0]}, {polygon[0][1]})")
print(f"  Top-right:    ({polygon[1][0]}, {polygon[1][1]})")
print(f"  Bottom-right: ({polygon[2][0]}, {polygon[2][1]})")
print(f"  Bottom-left:  ({polygon[3][0]}, {polygon[3][1]})")
print(f"  Frame size:   {w}x{h}")
print(f"{'='*60}")

# Draw the polygon on the frame
preview = frame.copy()
pts = np.array(polygon, dtype=np.int32).reshape(-1, 1, 2)
cv2.polylines(preview, [pts], isClosed=True, color=(0, 255, 0), thickness=3)

# Label the corners
for i, (px, py) in enumerate(polygon):
    label = f"P{i} ({px},{py})"
    cv2.putText(preview, label, (px + 5, py + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)

# Add title
cv2.putText(preview, "WATER_ROI Preview — Adjust polygon to match pool surface",
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)

cv2.imwrite(PREVIEW_PATH, preview)
print(f"\nAnnotated preview saved: {PREVIEW_PATH}")
print("Review the image and confirm or adjust the polygon before applying to settings.py")
