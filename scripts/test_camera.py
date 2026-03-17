"""
scripts/test_camera.py
─────────────────────
Task: P6-01 — verify webcam / RTSP camera connection and print frame shape.

Usage:
    conda activate aquaguard_env
    python scripts/test_camera.py               # test default webcam (index 0)
    python scripts/test_camera.py --source 0    # explicit webcam index
    python scripts/test_camera.py --source rtsp://192.168.1.10/stream1
    python scripts/test_camera.py --frames 30   # capture N frames
"""

import argparse
import sys
import time
import os

# ── make sure we can import from project root ──────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


def parse_args():
    parser = argparse.ArgumentParser(description='AquaGuard camera connection test')
    parser.add_argument(
        '--source', default='0',
        help='Camera source: integer webcam index or RTSP URL (default: 0)'
    )
    parser.add_argument(
        '--frames', type=int, default=10,
        help='Number of frames to capture before exiting (default: 10)'
    )
    parser.add_argument(
        '--timeout', type=float, default=10.0,
        help='Connection timeout in seconds (default: 10)'
    )
    return parser.parse_args()


def resolve_source(source_str: str):
    """Convert source string to int (webcam index) or keep as string (RTSP)."""
    try:
        return int(source_str)
    except ValueError:
        return source_str


def test_camera(source, num_frames: int = 10, timeout: float = 10.0) -> bool:
    """
    Connect to camera, capture `num_frames` frames, print diagnostics.

    Returns:
        True  — camera connected and frames read successfully
        False — connection failed or insufficient frames captured
    """
    try:
        import cv2
    except ImportError:
        print('[FAIL] opencv-python is not installed in aquaguard_env.')
        print('       Run: pip install opencv-python==4.10.0.84')
        return False

    source_label = str(source)
    print(f'\n{"=" * 60}')
    print(f'  AquaGuard — Camera Connection Test')
    print(f'{"=" * 60}')
    print(f'  Source  : {source_label}')
    print(f'  Frames  : {num_frames}')
    print(f'  Timeout : {timeout}s')
    print(f'{"=" * 60}\n')

    print(f'[INFO] Opening VideoCapture({source_label}) …')
    cap = cv2.VideoCapture(source)

    # ── connection check ────────────────────────────────────────────────────
    deadline = time.time() + timeout
    while not cap.isOpened():
        if time.time() > deadline:
            print(f'[FAIL] Could not open camera source: {source_label}')
            cap.release()
            return False
        time.sleep(0.1)

    print(f'[OK]   VideoCapture opened successfully.')

    # ── read camera properties ───────────────────────────────────────────────
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS)
    backend = cap.getBackendName() if hasattr(cap, 'getBackendName') else 'unknown'

    print(f'[INFO] Backend       : {backend}')
    print(f'[INFO] Resolution    : {width} × {height}')
    print(f'[INFO] Reported FPS  : {fps:.1f}')
    print()

    # ── capture loop ─────────────────────────────────────────────────────────
    frames_captured = 0
    frames_failed   = 0
    latencies       = []

    for i in range(num_frames):
        t0 = time.perf_counter()
        ret, frame = cap.read()
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if not ret or frame is None:
            frames_failed += 1
            print(f'  Frame {i + 1:3d}/{num_frames} — [FAIL] read() returned False')
            continue

        h, w, c = frame.shape
        latencies.append(elapsed_ms)
        frames_captured += 1
        print(f'  Frame {i + 1:3d}/{num_frames} — shape=({h}, {w}, {c})'
              f'  dtype={frame.dtype}  read={elapsed_ms:.1f}ms')

    cap.release()

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    print(f'{"─" * 60}')
    print(f'  SUMMARY')
    print(f'{"─" * 60}')
    print(f'  Frames captured  : {frames_captured}/{num_frames}')
    print(f'  Frames failed    : {frames_failed}')

    if latencies:
        avg_ms = sum(latencies) / len(latencies)
        min_ms = min(latencies)
        max_ms = max(latencies)
        print(f'  Read latency avg : {avg_ms:.1f}ms  (min={min_ms:.1f}ms  max={max_ms:.1f}ms)')
        print(f'  Estimated FPS    : {1000 / avg_ms:.1f}')

    success = frames_captured >= (num_frames // 2)   # at least 50 % captured
    print()
    if success:
        print(f'[PASS] Camera test PASSED — {frames_captured}/{num_frames} frames captured.')
    else:
        print(f'[FAIL] Camera test FAILED — only {frames_captured}/{num_frames} frames captured.')

    print(f'{"=" * 60}\n')
    return success


def main():
    args = parse_args()
    source = resolve_source(args.source)

    ok = test_camera(source, num_frames=args.frames, timeout=args.timeout)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
