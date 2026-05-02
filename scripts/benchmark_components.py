import time
import cv2
import numpy as np

def run_benchmark():
    from detection_engine.vision.detector import DrowningDetector
    from detection_engine.vision.pose_estimator import PoseEstimator

    print("Initializing components...")
    
    # 1. Detector (Finetuned YOLO + ByteTrack)
    detector = DrowningDetector(
        model_path="detection_engine/models/aquaguard_yolov8s.pt"
    )
    
    # 2. Pose Estimator (YOLO-Pose)
    pose_estimator = PoseEstimator(
        model_path="detection_engine/models/yolov8n-pose.pt"
    )

    import urllib.request
    import os
    if not os.path.exists("test_image.jpg"):
        urllib.request.urlretrieve("https://ultralytics.com/images/bus.jpg", "test_image.jpg")
    frame = cv2.imread("test_image.jpg")
    frame = cv2.resize(frame, (1280, 720))

    print("\nWarming up models (3 iterations)...")
    for _ in range(3):
        detections = detector.detect(frame)
        if detections:
            pose_results = pose_estimator.predict_frame(frame)
            for det in detections:
                pose_estimator.estimate_from_results(pose_results, det.bbox)

    print("\nStarting benchmark (50 iterations)...")
    
    detect_times = []
    bytetrack_times = []
    pose_full_times = []
    pose_match_times = []
    total_times = []

    for i in range(50):
        t0 = time.time()
        
        # Phase 1a: YOLO pure detection
        t_yolo_start = time.time()
        detector.model.predict(frame, verbose=False)
        t_yolo_end = time.time()

        # Phase 1b: YOLO + ByteTrack
        t_det_start = time.time()
        detections = detector.detect(frame)
        t_det_end = time.time()
        
        t_pose_full_start = time.time()
        t_pose_full_end = time.time()
        t_pose_match_start = time.time()
        t_pose_match_end = time.time()
        
        t_pose_full_start = time.time()
        pose_results = pose_estimator.predict_frame(frame)
        t_pose_full_end = time.time()
        
        # Phase 3: Pose Matching
        t_pose_match_start = time.time()
        if detections:
            for det in detections:
                pose_estimator.estimate_from_results(pose_results, det.bbox)
        t_pose_match_end = time.time()
            
        t_total = time.time()
        
        yolo_pure_time = (t_yolo_end - t_yolo_start) * 1000
        detect_times.append(yolo_pure_time)
        bytetrack_times.append(((t_det_end - t_det_start) * 1000) - yolo_pure_time)
        pose_full_times.append((t_pose_full_end - t_pose_full_start) * 1000)
        pose_match_times.append((t_pose_match_end - t_pose_match_start) * 1000)
        total_times.append((t_total - t0) * 1000)

    print("\n=== Benchmark Results (milliseconds per frame) ===")
    print(f"{'Component':<25} | {'Mean':>8} | {'Median':>8} | {'P95':>8}")
    print("-" * 55)
    print(f"{'Pure YOLOv11s Inference':<25} | {np.mean(detect_times):8.2f} | {np.median(detect_times):8.2f} | {np.percentile(detect_times, 95):8.2f}")
    print(f"{'ByteTrack Overhead':<25} | {np.mean(bytetrack_times):8.2f} | {np.median(bytetrack_times):8.2f} | {np.percentile(bytetrack_times, 95):8.2f}")
    print(f"{'Pose Estimation (YOLO)':<25} | {np.mean(pose_full_times):8.2f} | {np.median(pose_full_times):8.2f} | {np.percentile(pose_full_times, 95):8.2f}")
    print(f"{'Pose Matching (CPU)':<25} | {np.mean(pose_match_times):8.2f} | {np.median(pose_match_times):8.2f} | {np.percentile(pose_match_times, 95):8.2f}")
    print("-" * 55)
    print(f"{'Total Pipeline Latency':<25} | {np.mean(total_times):8.2f} | {np.median(total_times):8.2f} | {np.percentile(total_times, 95):8.2f}")
    print("==================================================")
    
    mean_fps = 1000.0 / np.mean(total_times)
    print(f"\nEstimated Max Throughput: {mean_fps:.1f} FPS")

if __name__ == "__main__":
    run_benchmark()
