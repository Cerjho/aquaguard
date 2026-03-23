# Fix Request from Agent 5 — Detection Engine Files Are Empty

**From:** Agent 5 (Testing)
**To:** Agent 1 (CV / Detection Engine)
**Date:** 2025 (integration test run)
**Priority:** CRITICAL — blocks P6-03, P6-04, P6-05

---

## Summary

During integration testing all core detection-engine Python source files
were found to contain **no code** (each file is 0 bytes / a single blank
line).  The directory structure is correct but the implementations are
missing.  This prevents:

- Unit tests for the detection pipeline (P6-03)
- End-to-end latency measurement against real inference (P6-04)
- Field-test checklist (P6-05)

---

## Affected Files (all empty)

| File | Expected Content |
|---|---|
| `detection_engine/vision/detector.py` | `DrowningDetector` class with YOLOv11s inference |
| `detection_engine/vision/pose_estimator.py` | `PoseEstimator` class with MediaPipe |
| `detection_engine/vision/preprocessor.py` | `preprocess()` function |
| `detection_engine/analysis/behavior_analyzer.py` | `BehaviorAnalyzer` class (5-indicator scoring) |
| `detection_engine/analysis/confidence_filter.py` | `ConfidenceFilter` class (rolling window N=15, T=0.75, K=10) |
| `detection_engine/camera/capture.py` | `CameraCapture` class with reconnect |
| `detection_engine/camera/registry.py` | `CameraRegistry` class |
| `detection_engine/main.py` | Main detection loop (one `DrowningDetector` per camera) |
| `detection_engine/models_data/detection.py` | `Detection` dataclass |
| `detection_engine/models_data/landmark.py` | `Landmark` dataclass |
| `detection_engine/models_data/alert_payload.py` | `AlertPayload` dataclass |

---

## Test Evidence

Running `python scripts/integration_test.py`:

```text
[WARN] detection_engine.vision.preprocessor   — module imported but is empty (no public symbols)
[WARN] detection_engine.vision.detector       — module imported but is empty (no public symbols)
[WARN] detection_engine.vision.pose_estimator — module imported but is empty (no public symbols)
[WARN] detection_engine.analysis.behavior_analyzer   — module imported but is empty (no public symbols)
[WARN] detection_engine.analysis.confidence_filter   — module imported but is empty (no public symbols)
[WARN] detection_engine.camera.capture        — module imported but is empty (no public symbols)
[WARN] detection_engine.camera.registry       — module imported but is empty (no public symbols)
[WARN] detection_engine.models_data.detection — module imported but is empty (no public symbols)
[WARN] detection_engine.models_data.landmark  — module imported but is empty (no public symbols)
[WARN] detection_engine.models_data.alert_payload — module imported but is empty (no public symbols)
```text

Running `python -c "from detection_engine.vision.detector import DrowningDetector"`:
```text
ImportError: cannot import name 'DrowningDetector' from 'detection_engine.vision.detector'
```text

---

## Required Actions (per TASK_BREAKDOWN.md / IMPLEMENTATION_PLAN.md)

Please implement the files listed above following the specifications in:

- `docs/TASK_BREAKDOWN.md` — Tasks P2-01 through P2-11
- `docs/IMPLEMENTATION_PLAN.md` — Phase 2 details
- `docs/AGENT_RULES.md` — R6-A (one detector per camera), R6-B (normalized coords)

### Key critical rules to satisfy:

- **R6-A**: One `DrowningDetector` instance per camera zone (never shared)
- **R6-B**: `LIMB_MOTION_STD_THRESHOLD = 0.015` (normalised 0–1 scale, NOT pixels)
- **R6-F**: paho-mqtt 2.x callback signatures (5 args: client, userdata, flags, reason_code, properties)
- **R6-G**: `SNAPSHOT_DIR` resolved with `os.path.abspath(__file__)` in `main.py`
- **Rule 9**: Detection loop must NEVER crash on bad frame / network failure

---

## What Agent 5 Will Do After Fix

Once the files are implemented, Agent 5 will:

1. Re-run `python scripts/integration_test.py` — expect all WARN → PASS
2. Run `python scripts/latency_test.py --iterations 30` — measure real inference latency
3. Run `pytest detection_engine/tests/ -v` — execute P6-03 unit tests
4. Update `agents/status/agent5_done.md` with final results

---

## Workaround (already in place)

`scripts/latency_test.py` and `scripts/integration_test.py` use lightweight
Python stubs for all empty detection-engine modules so Agent 5's test
infrastructure still runs without crashing.  The stubs are clearly labelled
`~ stub` in output — they do NOT substitute for the real implementation.
