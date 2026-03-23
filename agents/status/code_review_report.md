# AquaGuard Code Review Report

**Reviewed by:** Code Reviewer Agent  
**Date:** 2026-03-21  
**Overall Status:** PASS WITH WARNINGS

## Critical Issues (must fix before defense)

- **File:** `detection_engine/alert/api_client.py` line 63  
  **Issue:** Failed `POST /api/v1/events` payloads were only logged and dropped, causing silent event loss during transient backend/network failures.  
  **Fix:** Add an internal bounded retry queue and flush pending events before posting new events; keep explicit logging when queue is full.  

- **File:** `config/cameras.json` (missing file)  
  **Issue:** Required camera registry config file was missing from `config/`, risking runtime/config bootstrap failures for workflows expecting this source.  
  **Fix:** Add `config/cameras.json` with valid schema and at least one development camera entry.

## High Priority Issues

- **File:** `backend/routes/events.py` line 167  
  **Issue:** `socketio.emit()` calls were not guarded. If websocket transport fails after DB commit, request could error despite successful DB write.  
  **Fix:** Wrap emit block in `try/except`, log websocket errors, and keep successful DB response path.

- **File:** `backend/routes/events.py` line 193  
  **Issue:** `alert_event` emit after alert commit was also unguarded.  
  **Fix:** Wrap `socketio.emit('alert_event', ...)` in `try/except`, log failures without rolling back committed DB state.

- **File:** `detection_engine/analysis/behavior_analyzer.py` line 143  
  **Issue:** YOLO score contribution returned partial score for drowning class even below boost threshold; this deviated from strict binary boost behavior used in defense criteria.  
  **Fix:** Return `1.0` only when `yolo_class == "drowning"` and `yolo_conf >= YOLO_DROWNING_CONF_BOOST`; otherwise `0.0`.

- **File:** `frontend/src/utils/constants.js` line 6  
  **Issue:** `WS_URL` had no runtime fallback and could be undefined if env omitted, leading to socket connection failure and no live events in dashboard.  
  **Fix:** Fallback chain: `REACT_APP_WS_URL || API_BASE_URL || window.location.origin`.

- **File:** `frontend/src/components/camera/CameraCard.js` line 99  
  **Issue:** Focus trigger used `document.activeElement` from parent, which is unreliable under click/keyboard transitions and can break focus restoration.  
  **Fix:** Pass `e.currentTarget` from `CameraCard` to `CameraGrid.openFocus(...)`.

- **File:** `frontend/src/components/camera/CameraGrid.js` line 388  
  **Issue:** Focus callback ignored concrete trigger element and relied on global active element.  
  **Fix:** Accept `triggerElement` from child and store it directly for deterministic focus return.

- **File:** `backend/routes/cameras.py` line 209  
  **Issue:** MJPEG stream generator re-read JPEG file for every frame iteration/client even if image unchanged, creating unnecessary disk I/O and lag under multiple viewers.  
  **Fix:** Cache bytes and refresh only when `mtime` changes; reuse cached frame between changes.

- **File:** `detection_engine/alert/alert_engine.py` line 66  
  **Issue:** Snapshot path used string concatenation with `/`, reducing portability and consistency with path handling conventions.  
  **Fix:** Use `os.path.join(self._snapshot_dir, snapshot_filename)`.

## Root Cause: Detection Events Not Reaching Dashboard

- **Pipeline Trace**
  - `detection_engine/alert/api_client.py` builds payload and posts to `POST /api/v1/events`.
  - `backend/routes/events.py::create_event` persists event, then emits:
    - `detection_event`
    - `camera_status`
    - `system_status`
    - `alert_event` (when `alert_triggered=True`)
  - Frontend receives via `frontend/src/hooks/useAlertSocket.js`, then stores in `frontend/src/context/AlertContext.js`, consumed by `DetectionFeed.js`.

- **Exact Break**
  - The primary break was reliability:
    - Failed API posts were dropped with no retry queue in `api_client.py`.
    - `WS_URL` could be undefined in frontend, preventing socket connection.
    - Unhandled `socketio.emit()` errors in backend could break response flow after DB commit.

- **Exact Fix Applied**
  - Added bounded retry queue + flush-on-send logic in `api_client.py`.
  - Added robust `WS_URL` fallback in `frontend/src/utils/constants.js`.
  - Added guarded websocket emit blocks in `backend/routes/events.py`.

## Medium Priority Issues

- **File:** `scripts/integration_test.py` line ~383  
  **Issue:** API result key assumption can drift (`items` vs `events`) and produce false negatives in integration checks.  

- **File:** `frontend/src/components/events/DetectionFeed.js` line ~115  
  **Issue:** staleness indicator computation tied to `lastPollAt` updates; can be improved with periodic clock tick for strictly real-time stale UI transitions.

- **File:** `backend/seed.py`  
  **Issue:** direct `print()` statements in operational script; prefer structured logging for consistency.

## What Is Working Correctly

- R6-A: One `DrowningDetector` per zone in `detection_engine/main.py`.
- R6-B: MediaPipe threshold uses normalized `0.015`.
- R6-C: `SocketIO(async_mode='threading', ...)` configured in `backend/extensions.py`.
- R6-D: `db.session.commit()` occurs before `socketio.emit()` in event/alert flow.
- R6-E: Shared `socketio` imported from `extensions.py`, no route-level re-init.
- R6-F: paho-mqtt callbacks use 5-arg signatures for v2 API.
- R6-G: Snapshot base path in detection engine resolved from `os.path.abspath(__file__)`.
- R6-H: Frontend API usage centralized through `useApi` and constants.
- R6-I: `bcrypt.generate_password_hash(...).decode('utf-8')` applied where required.
- R6-J: `conftest.py` exists in both backend and detection test trees.
- Required tests pass after fixes:
  - `pytest backend/tests/ -v` → **60 passed**
  - `pytest detection_engine/tests/ -v` → **52 passed**

## Recommended Fix Order

1. Prevent event loss and websocket-path failures (API retry queue + WS URL fallback + guarded emits).
2. Keep detection scoring strict to defense criteria (YOLO class boost gate).
3. Reduce MJPEG latency bottleneck (cached frame bytes by mtime).
4. Stabilize frontend UX details (focus restoration and stale-indicator refinement).
5. Clean medium-priority script/consistency items.
