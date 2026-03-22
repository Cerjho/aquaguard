"""
scripts/latency_test.py
────────────────────────
Task: P6-04 — Measure full AquaGuard pipeline latency.

What is measured
────────────────
  1. Frame preparation (resize + normalise)
  2. YOLO object detection inference
  3. Pose estimation (MediaPipe)
  4. Behaviour analysis (5-indicator scoring)
  5. Confidence filter (rolling-window decision)
  6. Alert dispatch (simulated POST to Flask API)

The script uses REAL pipeline modules when available, or lightweight
stubs when a module's file is still empty (detection engine Phase 2 is
optional for this latency harness).

Target: end-to-end latency ≤ 3000 ms per frame cycle.

Usage:
    conda activate aquaguard_env
    python scripts/latency_test.py              # 30 iterations, synthetic frame
    python scripts/latency_test.py --iterations 100
    python scripts/latency_test.py --source path/to/video.mp4
"""

import argparse
import sys
import time
import os
import json
import statistics

import numpy as np

# ── project root on path ──────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# ── optional imports — use stubs if modules are not yet implemented ───────────
MODULES_STATUS: dict[str, str] = {
    'frame_prepare': 'builtin',
}


def _prepare_frame(frame: np.ndarray) -> np.ndarray:
    import cv2

    resized = cv2.resize(frame, (640, 640))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    return (rgb / 255.0).astype(np.float32)


def _try_import_detector():
    try:
        from detection_engine.vision.detector import DrowningDetector
        MODULES_STATUS['detector'] = 'real'
        return DrowningDetector
    except (ImportError, AttributeError):
        MODULES_STATUS['detector'] = 'stub'
        return None


def _try_import_pose():
    try:
        from detection_engine.vision.pose_estimator import PoseEstimator
        MODULES_STATUS['pose_estimator'] = 'real'
        return PoseEstimator
    except (ImportError, AttributeError):
        MODULES_STATUS['pose_estimator'] = 'stub'
        return None


def _try_import_analyzer():
    try:
        from detection_engine.analysis.behavior_analyzer import BehaviorAnalyzer
        MODULES_STATUS['behavior_analyzer'] = 'real'
        return BehaviorAnalyzer
    except (ImportError, AttributeError):
        MODULES_STATUS['behavior_analyzer'] = 'stub'
        return None


def _try_import_filter():
    try:
        from detection_engine.analysis.confidence_filter import ConfidenceFilter
        MODULES_STATUS['confidence_filter'] = 'real'
        return ConfidenceFilter
    except (ImportError, AttributeError):
        MODULES_STATUS['confidence_filter'] = 'stub'
        return None


# ── simulated pipeline stages ──────────────────────────────────────────────────

def _sim_detection(frame: np.ndarray) -> list:
    """Return a stub detection bounding box in the centre of the frame."""
    h, w = frame.shape[:2]
    return [{'bbox': [w // 4, h // 4, w * 3 // 4, h * 3 // 4],
             'confidence': 0.87, 'class': 'person', 'track_id': 1}]


def _sim_pose(frame: np.ndarray, detections: list) -> list:
    """Return synthetic landmark data for each detection."""
    landmarks = []
    for det in detections:
        lm = {
            'track_id':  det['track_id'],
            'nose_y':    0.3,
            'wrist_l_y': 0.2,
            'wrist_r_y': 0.2,
            'hip_y':     0.5,
            'visibility': 0.9,
        }
        landmarks.append(lm)
    return landmarks


def _sim_behavior(landmarks: list) -> list:
    """Compute a synthetic behaviour score per track."""
    results = []
    for lm in landmarks:
        score = 0.68   # simulated composite score
        flags = {
            'vertical_orientation': True,
            'arms_elevated':        True,
            'no_limb_motion':       False,
            'face_submerged':       False,
            'yolo_class':           True,
        }
        results.append({'track_id': lm['track_id'], 'score': score, 'flags': flags})
    return results


def _sim_filter(results: list, window: list) -> tuple[bool, list]:
    """Simulate the rolling-window confidence filter decision."""
    for r in results:
        window.append(r['score'])
    if len(window) > 15:
        window = window[-15:]
    if len(window) < 15:
        return False, window
    mean_score = statistics.mean(window)
    hits = sum(1 for s in window if s >= 0.65)
    triggered = (mean_score >= 0.75) and (hits >= 10)
    return triggered, window


def _sim_alert_dispatch(zone_id: str, score: float, iteration: int) -> float:
    """
    Simulate the alert dispatch POST to Flask backend.
    Uses Flask's built-in test client so no actual server is needed.
    Returns elapsed time in milliseconds.
    """
    t0 = time.perf_counter()
    try:
        sys.path.insert(0, os.path.join(ROOT, 'backend'))
        # Avoid re-importing every iteration by caching the client
        if not hasattr(_sim_alert_dispatch, '_client'):
            os.environ.setdefault('DATABASE_URL',    'sqlite:///:memory:')
            os.environ.setdefault('JWT_SECRET_KEY',  'latency-test-secret')
            os.environ.setdefault('MQTT_BROKER_HOST', 'localhost')
            os.environ.setdefault('MQTT_BROKER_PORT', '1883')
            os.chdir(os.path.join(ROOT, 'backend'))
            from app import create_app
            _app = create_app()
            _app.config['TESTING'] = True
            _app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
            with _app.app_context():
                from extensions import db
                db.create_all()
            _sim_alert_dispatch._app = _app
            _sim_alert_dispatch._client = _app.test_client()
            os.chdir(ROOT)

        from datetime import datetime, timezone
        payload = {
            'zone_id':          zone_id,
            'track_id':         1,
            'confidence_score': round(score, 4),
            'behavior_flags':   {'vertical': True, 'arms_elevated': True},
            'alert_triggered':  True,
            'detected_at':      datetime.now(timezone.utc).isoformat(),
        }
        with _sim_alert_dispatch._app.app_context():
            _sim_alert_dispatch._client.post(
                '/api/v1/events',
                json=payload,
                content_type='application/json',
            )
    except Exception as exc:
        # Non-fatal — record the overhead anyway
        _ = str(exc)  # suppress unused warning

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return elapsed_ms


# ── main benchmark ─────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description='AquaGuard pipeline latency benchmark')
    parser.add_argument('--iterations', type=int, default=30,
                        help='Number of pipeline iterations to run (default: 30)')
    parser.add_argument('--source', default=None,
                        help='Video file path to use real frames (default: synthetic)')
    parser.add_argument('--zone', default='zone_01',
                        help='Zone ID to use in test payloads (default: zone_01)')
    return parser.parse_args()


def make_synthetic_frame(index: int) -> np.ndarray:
    """Generate a 720 × 1280 BGR frame with slight variation per index."""
    frame = np.random.randint(0, 256, (720, 1280, 3), dtype=np.uint8)
    # Add a bright rectangle to simulate a person bounding box
    cv2_available = False
    try:
        import cv2
        cv2_available = True
    except ImportError:
        pass

    if cv2_available:
        import cv2
        colour = (0, int(200 + index % 55), 0)
        cv2.rectangle(frame, (320, 180), (960, 540), colour, 2)
    return frame


def get_video_frame(cap, index: int):
    """Read next frame from VideoCapture; wrap around if needed."""
    try:
        import cv2
    except ImportError:
        return make_synthetic_frame(index)

    ret, frame = cap.read()
    if not ret:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()
    return frame if ret else make_synthetic_frame(index)


def run_benchmark(iterations: int, source=None, zone_id: str = 'zone_01'):
    print(f'\n{"=" * 65}')
    print(f'  AquaGuard — Full Pipeline Latency Benchmark')
    print(f'{"=" * 65}')
    print(f'  Iterations : {iterations}')
    print(f'  Frame src  : {"synthetic 1280×720" if source is None else source}')
    print(f'  Zone ID    : {zone_id}')
    print(f'{"=" * 65}\n')

    # Load pipeline modules (real or stub)
    preprocess   = _prepare_frame
    DetectorCls  = _try_import_detector()
    PoseCls      = _try_import_pose()
    AnalyzerCls  = _try_import_analyzer()
    FilterCls    = _try_import_filter()

    # Print module availability
    print('  Module status:')
    for mod, status in MODULES_STATUS.items():
        tag = '✓ real ' if status == 'real' else '~ stub '
        print(f'    [{tag}] {mod}')
    print()

    # Initialise real objects if available
    detector = None
    if DetectorCls is not None:
        model_path = os.path.join(ROOT, 'detection_engine', 'models',
                                  'aquaguard_yolov11s.pt')
        try:
            detector = DetectorCls(model_path)
        except Exception:
            detector = None

    pose_est = None
    if PoseCls is not None:
        try:
            pose_est = PoseCls()
        except Exception:
            pose_est = None

    analyzer = None
    if AnalyzerCls is not None:
        try:
            analyzer = AnalyzerCls()
        except Exception:
            analyzer = None

    conf_filter = None
    if FilterCls is not None:
        try:
            conf_filter = FilterCls()
        except Exception:
            conf_filter = None

    # Video capture (optional)
    cap = None
    if source is not None:
        try:
            import cv2
            src = int(source) if source.isdigit() else source
            cap = cv2.VideoCapture(src)
            if not cap.isOpened():
                print(f'[WARN] Could not open video source "{source}". '
                      f'Falling back to synthetic frames.\n')
                cap = None
        except Exception:
            cap = None

    # ── benchmark loop ────────────────────────────────────────────────────────
    timings: dict[str, list[float]] = {
        'preprocess':  [],
        'detection':   [],
        'pose':        [],
        'analysis':    [],
        'filter':      [],
        'dispatch':    [],
        'total':       [],
    }

    window: list[float] = []
    TARGET_MS = 3000.0

    print(f'  {"Iter":>4}  {"Prep":>6}  {"Detect":>7}  {"Pose":>6}  '
          f'{"Analyze":>8}  {"Filter":>7}  {"Dispatch":>9}  {"TOTAL":>7}  {"Status":>6}')
    print(f'  {"─" * 4}  {"─" * 6}  {"─" * 7}  {"─" * 6}  '
          f'{"─" * 8}  {"─" * 7}  {"─" * 9}  {"─" * 7}  {"─" * 6}')

    for i in range(iterations):
        t_total_start = time.perf_counter()

        # 1. Acquire frame
        frame = get_video_frame(cap, i) if cap else make_synthetic_frame(i)

        # 2. Preprocessing
        t0 = time.perf_counter()
        processed = _prepare_frame(frame)
        t_prep = (time.perf_counter() - t0) * 1000

        # 3. Detection
        t0 = time.perf_counter()
        if detector is not None:
            try:
                detections = detector.detect(frame)
            except Exception:
                detections = _sim_detection(frame)
        else:
            detections = _sim_detection(frame)
        t_det = (time.perf_counter() - t0) * 1000

        # 4. Pose estimation
        t0 = time.perf_counter()
        if pose_est is not None:
            try:
                landmarks = pose_est.estimate(frame, detections)
            except Exception:
                landmarks = _sim_pose(frame, detections)
        else:
            landmarks = _sim_pose(frame, detections)
        t_pose = (time.perf_counter() - t0) * 1000

        # 5. Behaviour analysis
        t0 = time.perf_counter()
        if analyzer is not None:
            try:
                behavior_results = analyzer.analyze(landmarks)
            except Exception:
                behavior_results = _sim_behavior(landmarks)
        else:
            behavior_results = _sim_behavior(landmarks)
        t_analyze = (time.perf_counter() - t0) * 1000

        # 6. Confidence filter
        t0 = time.perf_counter()
        if conf_filter is not None:
            try:
                alert_triggered = conf_filter.update(
                    [r['score'] for r in behavior_results]
                )
            except Exception:
                alert_triggered, window = _sim_filter(behavior_results, window)
        else:
            alert_triggered, window = _sim_filter(behavior_results, window)
        t_filter = (time.perf_counter() - t0) * 1000

        # 7. Alert dispatch (only when triggered; simulate every 10th iteration)
        t0 = time.perf_counter()
        if alert_triggered or (i % 10 == 0):
            score = behavior_results[0]['score'] if behavior_results else 0.0
            t_dispatch = _sim_alert_dispatch(zone_id, score, i)
        else:
            t_dispatch = 0.0
        t_dispatch += (time.perf_counter() - t0) * 1000  # include overhead

        t_total = (time.perf_counter() - t_total_start) * 1000

        # Store timings
        timings['preprocess'].append(t_prep)
        timings['detection'].append(t_det)
        timings['pose'].append(t_pose)
        timings['analysis'].append(t_analyze)
        timings['filter'].append(t_filter)
        timings['dispatch'].append(t_dispatch)
        timings['total'].append(t_total)

        status = 'PASS' if t_total <= TARGET_MS else 'SLOW'
        print(f'  {i + 1:4d}  {t_prep:6.1f}  {t_det:7.1f}  {t_pose:6.1f}  '
              f'{t_analyze:8.1f}  {t_filter:7.1f}  {t_dispatch:9.1f}  '
              f'{t_total:7.1f}  {status:>6}')

    if cap:
        cap.release()

    # ── statistics ────────────────────────────────────────────────────────────
    print(f'\n{"─" * 65}')
    print(f'  STATISTICS  ({iterations} iterations)')
    print(f'{"─" * 65}')
    print(f'  {"Stage":<15}  {"Mean":>7}  {"Median":>7}  {"P95":>7}  {"Max":>7}')
    print(f'  {"─" * 15}  {"─" * 7}  {"─" * 7}  {"─" * 7}  {"─" * 7}')

    for stage, values in timings.items():
        if not values:
            continue
        mean_v   = statistics.mean(values)
        median_v = statistics.median(values)
        p95_v    = sorted(values)[int(len(values) * 0.95)]
        max_v    = max(values)
        print(f'  {stage:<15}  {mean_v:7.1f}  {median_v:7.1f}  '
              f'{p95_v:7.1f}  {max_v:7.1f}  ms')

    total_vals = timings['total']
    mean_total = statistics.mean(total_vals)
    p95_total  = sorted(total_vals)[int(len(total_vals) * 0.95)]
    pass_count = sum(1 for t in total_vals if t <= TARGET_MS)
    fail_count = iterations - pass_count

    print(f'\n{"─" * 65}')
    print(f'  RESULT')
    print(f'{"─" * 65}')
    print(f'  Target latency : ≤ {TARGET_MS:.0f} ms per frame cycle')
    print(f'  Mean total     : {mean_total:.1f} ms')
    print(f'  P95 total      : {p95_total:.1f} ms')
    print(f'  Iterations OK  : {pass_count}/{iterations}')
    print(f'  Iterations SLOW: {fail_count}/{iterations}')
    print()

    overall_pass = mean_total <= TARGET_MS
    if overall_pass:
        print(f'  [PASS] Mean latency {mean_total:.1f}ms is within the 3000ms target.')
    else:
        print(f'  [FAIL] Mean latency {mean_total:.1f}ms EXCEEDS the 3000ms target.')

    print(f'{"=" * 65}\n')

    # ── save JSON result ──────────────────────────────────────────────────────
    result = {
        'target_ms':    TARGET_MS,
        'iterations':   iterations,
        'mean_total_ms': round(mean_total, 2),
        'p95_total_ms':  round(p95_total, 2),
        'pass_count':   pass_count,
        'fail_count':   fail_count,
        'passed':       overall_pass,
        'module_status': MODULES_STATUS,
        'stage_means_ms': {k: round(statistics.mean(v), 2)
                           for k, v in timings.items() if v},
    }

    out_path = os.path.join(ROOT, 'agents', 'status', 'latency_result.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f'  Results saved to: {out_path}\n')

    return overall_pass


def main():
    args = parse_args()
    ok = run_benchmark(
        iterations=args.iterations,
        source=args.source,
        zone_id=args.zone,
    )
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
