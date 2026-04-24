"""YOLO inference benchmark — 100 iterations, reports avg ms and estimated FPS."""
import time
import logging
import numpy as np
import os
import cv2

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

MODELS_DIR = "detection_engine/models"
ITERATIONS = 100
WARMUP_ITERATIONS = 5
TEST_IMAGE_PATH = "detection_engine/bus.jpg"


def run_benchmark():
    try:
        from ultralytics import YOLO
        import torch
        from detection_engine.vision.detector import DrowningDetector
    except ImportError as exc:
        logger.error("Missing dependency: %s", exc)
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    model_paths = []
    if os.path.exists(MODELS_DIR):
        for f in os.listdir(MODELS_DIR):
            if f.endswith(".pt") or f.endswith(".onnx"):
                model_paths.append(os.path.join(MODELS_DIR, f))
    else:
        logger.error("Models directory not found: %s", MODELS_DIR)
        return

    if not model_paths:
        logger.error("No models found in %s", MODELS_DIR)
        return

    # Load test image or create dummy
    if os.path.exists(TEST_IMAGE_PATH):
        logger.info("Using test image %s", TEST_IMAGE_PATH)
        frame = cv2.imread(TEST_IMAGE_PATH)
        if frame is None:
            logger.warning("Failed to read image. Falling back to dummy.")
            frame = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
    else:
        logger.warning("Test image not found. Using dummy frame.")
        frame = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

    for model_path in model_paths:
        logger.info("\n" + "=" * 50)
        logger.info("Benchmarking model: %s", model_path)
        logger.info("=" * 50)
        
        logger.info("Loading model from %s on device=%s ...", model_path, device)
        try:
            model = YOLO(model_path)
            detector = DrowningDetector(model_path)
        except Exception as exc:
            logger.error("Failed to load model %s: %s", model_path, exc)
            continue

        # Benchmark 1: Raw Inference (YOLO.predict)
        logger.info("\n--- Raw Inference (YOLO.predict) ---")
        logger.info("Warming up (%d iterations) ...", WARMUP_ITERATIONS)
        for _ in range(WARMUP_ITERATIONS):
            model.predict(frame, device=device, verbose=False)

        logger.info("Benchmarking %d iterations ...", ITERATIONS)
        raw_timings = []
        for i in range(ITERATIONS):
            start = time.perf_counter()
            model.predict(frame, device=device, verbose=False)
            elapsed_ms = (time.perf_counter() - start) * 1000
            raw_timings.append(elapsed_ms)
            if (i + 1) % 20 == 0:
                logger.info("  [%3d/%d] %.1f ms", i + 1, ITERATIONS, elapsed_ms)

        # Benchmark 2: End-to-End Detection + BBox Extraction (DrowningDetector.detect)
        logger.info("\n--- End-to-End Detection + BBox Extraction (DrowningDetector.detect) ---")
        logger.info("Warming up (%d iterations) ...", WARMUP_ITERATIONS)
        for _ in range(WARMUP_ITERATIONS):
            detector.detect(frame)

        logger.info("Benchmarking %d iterations ...", ITERATIONS)
        e2e_timings = []
        num_detections = 0
        for i in range(ITERATIONS):
            start = time.perf_counter()
            dets = detector.detect(frame)
            elapsed_ms = (time.perf_counter() - start) * 1000
            e2e_timings.append(elapsed_ms)
            if i == 0:
                num_detections = len(dets)
            if (i + 1) % 20 == 0:
                logger.info("  [%3d/%d] %.1f ms", i + 1, ITERATIONS, elapsed_ms)

        raw_avg = np.mean(raw_timings)
        e2e_avg = np.mean(e2e_timings)

        print("\n" + "=" * 50)
        print(f"Benchmark Results: {os.path.basename(model_path)}")
        print("=" * 50)
        print(f"Device               : {device.upper()}")
        print(f"Iterations           : {ITERATIONS}")
        print(f"Detections per frame : {num_detections}")
        print("-" * 50)
        print("Raw Inference (YOLO.predict):")
        print(f"  Avg latency : {raw_avg:.2f} ms")
        print(f"  Est. FPS    : {1000.0 / raw_avg:.1f}")
        print("-" * 50)
        print("End-to-End (Inference + Tracking + BBox Parsing):")
        print(f"  Avg latency : {e2e_avg:.2f} ms")
        print(f"  Est. FPS    : {1000.0 / e2e_avg:.1f}")
        print(f"  Overhead    : {e2e_avg - raw_avg:.2f} ms")
        print("=" * 50)


if __name__ == "__main__":
    run_benchmark()
