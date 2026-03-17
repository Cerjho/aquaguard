"""YOLOv11s inference benchmark — 100 iterations, reports avg ms and estimated FPS."""
import time
import logging
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

MODEL_PATH = "detection_engine/models/aquaguard_yolov11s.pt"
ITERATIONS = 100
WARMUP_ITERATIONS = 5


def run_benchmark():
    try:
        from ultralytics import YOLO
        import torch
    except ImportError as exc:
        logger.error("Missing dependency: %s", exc)
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading model from %s on device=%s ...", MODEL_PATH, device)

    try:
        model = YOLO(MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        return

    # 640×640 RGB dummy frame
    dummy_frame = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

    logger.info("Warming up (%d iterations) ...", WARMUP_ITERATIONS)
    for _ in range(WARMUP_ITERATIONS):
        model.predict(dummy_frame, device=device, verbose=False)

    logger.info("Benchmarking %d iterations ...", ITERATIONS)
    timings = []
    for i in range(ITERATIONS):
        start = time.perf_counter()
        model.predict(dummy_frame, device=device, verbose=False)
        elapsed_ms = (time.perf_counter() - start) * 1000
        timings.append(elapsed_ms)
        if (i + 1) % 20 == 0:
            logger.info("  [%3d/%d] %.1f ms", i + 1, ITERATIONS, elapsed_ms)

    avg_ms = np.mean(timings)
    min_ms = np.min(timings)
    max_ms = np.max(timings)
    p95_ms = np.percentile(timings, 95)
    estimated_fps = 1000.0 / avg_ms

    print("\n" + "=" * 50)
    print("AquaGuard — YOLOv11s Benchmark Results")
    print("=" * 50)
    print(f"Device       : {device.upper()}")
    print(f"Iterations   : {ITERATIONS}")
    print(f"Avg latency  : {avg_ms:.2f} ms")
    print(f"Min latency  : {min_ms:.2f} ms")
    print(f"Max latency  : {max_ms:.2f} ms")
    print(f"p95 latency  : {p95_ms:.2f} ms")
    print(f"Est. FPS     : {estimated_fps:.1f}")
    print("=" * 50)


if __name__ == "__main__":
    run_benchmark()
