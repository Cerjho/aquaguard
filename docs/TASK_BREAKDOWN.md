# AquaGuard — Task Breakdown

> This file is the granular task list for the Claude agent.
> Each task maps to a specific file in REPO_STRUCTURE.md.
> Work through tasks in order within each phase. Mark tasks complete as you go.
> Status: [ ] = pending, [x] = done, [~] = in progress, [!] = blocked

---

## Phase 1 — Environment and Project Setup

### P1-01 — Initialize repository structure

- [ ] Create all directories defined in REPO_STRUCTURE.md
- [ ] Create all `__init__.py` files in Python packages
- [ ] Create `.gitignore` with entries from REPO_STRUCTURE.md
- [ ] Create `.env.example` with all required keys (no real values)
- [ ] Create `README.md` with project title, team, and setup instructions

### P1-02 — Python environment

- [ ] Confirm `aquaguard_env` is active: `.\aquaguard_env\Scripts\Activate.ps1`
- [ ] Confirm ultralytics and CUDA already work: `python -c "from ultralytics import YOLO; import torch; print(torch.cuda.is_available())"`
- [ ] Install remaining packages using the targeted pip commands in TECH_STACK_LOCK.md — **do NOT run `pip install -r requirements.txt` from scratch**
- [ ] Create `requirements.txt` with exact versions from TECH_STACK_LOCK.md for documentation purposes only — comment out torch/ultralytics/opencv lines that are already installed
- [ ] Create `requirements-dev.txt`
- [ ] Document activation command in README.md: `.\aquaguard_env\Scripts\Activate.ps1`

### P1-03 — Configuration system

- [ ] Create `config/settings.py` with all constants:

  ```python
  # Detection thresholds
  CONFIDENCE_WINDOW_SIZE = 15
  CONFIDENCE_THRESHOLD = 0.75
  CONSECUTIVE_FRAMES_REQUIRED = 10
  CONSECUTIVE_FRAME_LOW_THRESHOLD = 0.65

  # Behavior analyzer weights
  WEIGHT_VERTICAL_ORIENTATION = 0.30
  WEIGHT_ARMS_ELEVATED = 0.25
  WEIGHT_NO_LIMB_MOTION = 0.20
  WEIGHT_FACE_SUBMERGED = 0.15
  WEIGHT_YOLO_CLASS = 0.10

  # Behavior analyzer thresholds
  VERTICAL_ANGLE_THRESHOLD_DEG = 30
  LIMB_MOTION_STD_THRESHOLD = 0.015  # normalized — MediaPipe returns 0.0–1.0, NOT pixels
  FACE_VISIBILITY_THRESHOLD = 0.4
  YOLO_DROWNING_CONF_BOOST = 0.6

  # MQTT
  MQTT_BROKER_HOST = "localhost"
  MQTT_BROKER_PORT = 1883
  MQTT_TOPIC_ALERT = "aquaguard/alert"
  MQTT_TOPIC_RESET = "aquaguard/alert/reset"
  MQTT_TOPIC_DETECTION = "aquaguard/detection"
  MQTT_TOPIC_DEVICE_STATUS = "aquaguard/device/status"

  # Camera reconnect
  RECONNECT_BACKOFF_SECONDS = [1, 2, 4, 8, 30]
  RECONNECT_MAX_CONSECUTIVE_FAILURES = 5

  # Alert
  ALARM_DURATION_SECONDS = 30
  ```

- [ ] Create `config/cameras.json` with one dev webcam entry (zone_id: "zone_dev", rtsp_url: 0)

### P1-04 — Data model classes

- [ ] Create `detection_engine/models_data/detection.py` — `Detection` dataclass
- [ ] Create `detection_engine/models_data/landmark.py` — `Landmark` dataclass
- [ ] Create `detection_engine/models_data/alert_payload.py` — `AlertPayload` dataclass

### P1-05 — Verify CUDA

- [ ] Create `scripts/verify_cuda.py` that prints torch CUDA status, device name, and VRAM
- [ ] Create `detection_engine/benchmark.py` — 100-iteration YOLOv11s inference benchmark, prints avg ms and estimated FPS

---

## Phase 2 — Detection Engine

### P2-01 — Frame preprocessor

**File:** `detection_engine/vision/preprocessor.py`

- [ ] Implement `preprocess(frame: np.ndarray) -> np.ndarray`
  - Resize to 640×640
  - Convert BGR to RGB
  - Return as float32 normalized array

### P2-02 — Camera capture

**File:** `detection_engine/camera/capture.py`

- [ ] Implement `CameraCapture` class
  - `__init__(zone_id, rtsp_url, frame_rate)` — store config, init `cv2.VideoCapture`
  - `start()` — launch capture thread
  - `read() -> tuple[np.ndarray, dict]` — return latest frame + metadata dict `{zone_id, timestamp}`
  - `stop()` — set stop event, join thread
  - Internal `_capture_loop()` — read frames in loop, on failure trigger `_reconnect()`
  - `_reconnect()` — exponential backoff loop using `RECONNECT_BACKOFF_SECONDS`
- [ ] Log connect/disconnect events via Python `logging` module

### P2-03 — Camera registry

**File:** `detection_engine/camera/registry.py`

- [ ] Implement `CameraRegistry` class
  - `load_from_json(path)` — parse `cameras.json`, create `CameraCapture` per entry
  - `get(zone_id) -> CameraCapture` — O(1) dict lookup
  - `start_all()` / `stop_all()` — lifecycle management
  - Internal storage: `Dict[str, CameraCapture]`

### P2-04 — YOLOv11s detector

**File:** `detection_engine/vision/detector.py`

- [ ] Implement `DrowningDetector` class
  - `__init__(model_path)` — load YOLO model, assign to `device="cuda"`, verify device
  - `detect(frame: np.ndarray) -> List[Detection]`
    - Call `model.track(frame, persist=True, conf=0.4, device="cuda", verbose=False)`
    - Parse results into `Detection` dataclass list
    - Map class index to string label: `{0: "drowning", 1: "swimming", 2: "person_out_of_water"}`
    - Skip detections with `track_id` is None
  - Handle `cuda out of memory` exception — log error, fall back to CPU for that frame
  - **CRITICAL:** Each `DrowningDetector` instance maintains its own ByteTrack state. Never share one instance across multiple cameras. `main.py` must instantiate one `DrowningDetector` per camera zone.

### P2-05 — Pose estimator

**File:** `detection_engine/vision/pose_estimator.py`

- [ ] Implement `PoseEstimator` class
  - `__init__()` — init `mp.solutions.pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)`
  - `estimate(frame: np.ndarray, bbox: tuple) -> Optional[List[Landmark]]`
    - Crop ROI from frame using bbox `(x1, y1, x2, y2)`
    - Handle edge case: bbox extends beyond frame boundaries (clamp to frame size)
    - Convert ROI BGR→RGB, run `pose.process()`
    - Return `None` if `results.pose_landmarks` is None
    - Return list of 33 `Landmark` objects with (x, y, z, visibility)

### P2-06 — Behavior analyzer

**File:** `detection_engine/analysis/behavior_analyzer.py`

- [ ] Implement `BehaviorAnalyzer` class
  - `__init__()` — init `Dict[str, deque(maxlen=10)]` for per-track landmark history
  - `analyze(landmarks: List[Landmark], yolo_class: str, yolo_conf: float, track_id: str) -> float`
  - Implement each indicator as a private method:
    - `_is_vertical_orientation(landmarks) -> bool`
      - Compute shoulder midpoint: avg of landmark[11] and landmark[12]
      - Compute hip midpoint: avg of landmark[23] and landmark[24]
      - Compute angle of (shoulder→hip) vector from vertical using `np.arctan2`
      - Return `True` if angle in degrees `< VERTICAL_ANGLE_THRESHOLD_DEG`
    - `_are_arms_elevated(landmarks) -> bool`
      - Return `True` if `landmark[15].y < landmark[11].y AND landmark[16].y < landmark[12].y`
      - (smaller y = higher in image frame)
    - `_no_limb_motion(track_id, landmarks) -> bool`
      - Append current wrist_x and ankle_x to history deque for this track_id
      - If history len < 5: return False (not enough data)
      - Compute std_dev of last 10 wrist_x positions and ankle_x positions
      - **CRITICAL:** MediaPipe returns normalized coords [0.0, 1.0] — compare against `LIMB_MOTION_STD_THRESHOLD = 0.015`, NOT a pixel value
      - Return `True` if both std_devs `< LIMB_MOTION_STD_THRESHOLD`
    - `_is_face_submerged(landmarks) -> bool`
      - Return `True` if `landmark[0].visibility < FACE_VISIBILITY_THRESHOLD`
    - Temporal consistency bonus:
      - Keep a separate `Dict[str, deque(maxlen=5)]` score history per track
      - After computing raw score, compute ratio of last 5 scores that exceeded 0.5
      - `final_score = min(1.0, raw_score * (1.0 + 0.1 * temporal_ratio))`

### P2-07 — Confidence filter

**File:** `detection_engine/analysis/confidence_filter.py`

- [ ] Implement `ConfidenceFilter` class
  - `__init__()` — init `Dict[str, deque(maxlen=N)]` using `CONFIDENCE_WINDOW_SIZE`
  - `evaluate(track_id: str, score: float) -> bool`
    - Append score to track buffer
    - If `len(buffer) < CONFIDENCE_WINDOW_SIZE`: return False
    - Check condition 1: `mean(buffer) > CONFIDENCE_THRESHOLD`
    - Check condition 2: `sum(1 for s in list(buffer)[-CONSECUTIVE_FRAMES_REQUIRED:] if s > CONSECUTIVE_FRAME_LOW_THRESHOLD) >= CONSECUTIVE_FRAMES_REQUIRED`
    - If both True: clear buffer for this track_id, return True
    - Else: return False
  - `remove_track(track_id: str)` — delete stale tracks (cleanup for lost persons)

### P2-08 — MQTT client

**File:** `detection_engine/alert/mqtt_client.py`

- [ ] Implement `MQTTClient` class
  - `__init__(broker_host, broker_port)` — init paho client with `CallbackAPIVersion.VERSION2` (import from `paho.mqtt.enums`)
  - **CRITICAL — paho-mqtt 2.x callback signatures are different from 1.x:**
    - `on_connect(client, userdata, connect_flags, reason_code, properties)` — 5 args
    - `on_disconnect(client, userdata, disconnect_flags, reason_code, properties)` — 5 args
    - Using old 3- or 4-argument signatures raises `TypeError` at runtime
  - `connect()` — call `client.connect(host, port)` then `client.loop_start()` (background thread)
  - `publish_alert(payload: dict)` — serialize to JSON, publish to `MQTT_TOPIC_ALERT` with QoS 1
  - `publish_detection(payload: dict)` — publish to `MQTT_TOPIC_DETECTION` with QoS 0
  - Reconnect on disconnect with 5-second retry via `client.reconnect()`

### P2-09 — API client

**File:** `detection_engine/alert/api_client.py`

- [ ] Implement `APIClient` class
  - `__init__(base_url, api_key)` — store base URL and shared API key
  - `log_event(payload: AlertPayload)` — POST to `/api/v1/events`, handle connection errors gracefully (log error, do not crash detection loop)

### P2-10 — Alert engine

**File:** `detection_engine/alert/alert_engine.py`

- [ ] Implement `AlertEngine` class
  - `__init__(mqtt_client, api_client, snapshot_dir: str)` — store dependencies; `snapshot_dir` is an absolute path resolved by `main.py` using `__file__`, not a relative path
  - `dispatch(zone_id: str, track_id: str, score: float, frame: np.ndarray)`
    - Generate `event_id = str(uuid.uuid4())`
    - Encode frame to JPEG: `_, buf = cv2.imencode('.jpg', frame)`
    - Write bytes to `{snapshot_dir}/{event_id}.jpg`
    - Encode same buffer to base64 string for API payload
    - Build payload dict with all required fields
    - Dispatch in 3 daemon threads simultaneously:
      - Thread 1: `mqtt_client.publish_alert(payload)`
      - Thread 2: `api_client.log_event(payload)`
      - Thread 3: Python logger info (latency timestamp)
  - **CRITICAL — do not hardcode snapshot path.** Always receive it as a constructor argument resolved from `main.py`

### P2-11 — Main detection loop

**File:** `detection_engine/main.py`

- [ ] Load `cameras.json`, initialize `CameraRegistry`
- [ ] Initialize `DrowningDetector`, `PoseEstimator`, `BehaviorAnalyzer`, `ConfidenceFilter`, `AlertEngine`
- [ ] Start all camera capture threads
- [ ] Main loop:

  ```python
  for zone_id, camera in registry.cameras.items():
      frame, metadata = camera.read()
      if frame is None: continue
      detections = detector.detect(frame)
      for det in detections:
          landmarks = pose_estimator.estimate(frame, det.bbox)
          if landmarks is None: continue
          score = behavior_analyzer.analyze(landmarks, det.class_label, det.confidence, det.track_id)
          if confidence_filter.evaluate(det.track_id, score):
              alert_engine.dispatch(zone_id, det.track_id, score, frame)
  ```

- [ ] Handle `KeyboardInterrupt` to gracefully stop all camera threads

---

## Phase 3 — Flask Backend

### P3-01 — App factory

**File:** `backend/app.py`

- [ ] Implement `create_app()` factory function
- [ ] Create `backend/extensions.py` first — define all extension instances here so they can be imported by routes without circular imports:

  ```python
  # backend/extensions.py
  from flask_sqlalchemy import SQLAlchemy
  from flask_jwt_extended import JWTManager
  from flask_socketio import SocketIO
  from flask_bcrypt import Bcrypt
  from flask_migrate import Migrate
  from flask_cors import CORS

  db       = SQLAlchemy()
  jwt      = JWTManager()
  socketio = SocketIO(async_mode='threading', cors_allowed_origins="*")  # async_mode REQUIRED
  bcrypt   = Bcrypt()
  migrate  = Migrate()
  cors     = CORS()
  ```

- [ ] In `create_app()`: import from `extensions.py`, call `.init_app(app)` on each
- [ ] **CRITICAL:** `socketio` must be initialized with `async_mode='threading'` — without this, WebSocket connections will hang or fail in development and threaded production environments
- [ ] Register blueprints: auth, events, alerts, cameras, reports
- [ ] Configure CORS origin: `http://localhost:3000`
- [ ] **Emitting from routes:** import `socketio` from `extensions` in each route file that needs to emit — never call `emit()` directly without the `socketio` instance prefix outside of a SocketIO event handler

### P3-02 — Database models

**File:** `backend/models.py`

- [ ] Implement all 5 SQLAlchemy models: `User`, `CameraZone`, `DetectionEvent`, `Alert`, `SystemLog`
- [ ] Add `__repr__` to each model
- [ ] Add indexes: `detected_at`, `zone_id`, `status`, `alert_triggered`
- [ ] Add `to_dict()` method to each model for JSON serialization

### P3-03 — DB initialization + seed

- [ ] `flask db init`, `flask db migrate`, `flask db upgrade` (document in README)
- [ ] Create `backend/seed.py`:
  - Create default admin user: username=`admin`, password=`aquaguard2026`, role=`admin`
  - Create default lifeguard user: username=`lifeguard`, password=`lifeguard123`, role=`lifeguard`
  - Create one default camera zone from `cameras.json`

### P3-04 — Auth routes

**File:** `backend/routes/auth.py`

- [ ] `POST /api/v1/auth/login` — verify username + bcrypt password, return access + refresh JWT
- [ ] `POST /api/v1/auth/refresh` — `@jwt_required(refresh=True)`, return new access token
- [ ] `POST /api/v1/auth/logout` — return 200 (client-side token deletion)
- [ ] Create `backend/auth_helpers.py` — `role_required(role)` decorator using `get_jwt()` claims

### P3-05 — Events routes

**File:** `backend/routes/events.py`

- [ ] `POST /api/v1/events` — internal endpoint
  - Validate payload fields
  - Save JPEG snapshot from base64 to `backend/snapshots/{event_id}.jpg`
  - Create `DetectionEvent` record
  - If `alert_triggered=True`: create `Alert` record, emit `alert_event` via SocketIO
- [ ] `GET /api/v1/events` — paginated, support `zone_id`, `from`, `to`, `alert_triggered`, `page`, `limit` params

### P3-06 — Alerts routes

**File:** `backend/routes/alerts.py`

- [ ] `GET /api/v1/alerts` — list alerts, support `?status=unacknowledged`
- [ ] `POST /api/v1/alerts/<alert_id>/acknowledge`
  - Set `status = "acknowledged"`
  - Set `acknowledged_by = current_user_id` from JWT
  - Set `acknowledged_at = datetime.utcnow()`

### P3-07 — Cameras routes

**File:** `backend/routes/cameras.py`

- [ ] `GET /api/v1/cameras` — list all active cameras
- [ ] `POST /api/v1/cameras` — admin only, create new `CameraZone` record
- [ ] `PUT /api/v1/cameras/<zone_id>` — admin only, update camera config
- [ ] `DELETE /api/v1/cameras/<zone_id>` — admin only, set `is_active = False`

### P3-08 — Reports routes

**File:** `backend/routes/reports.py`

- [ ] `GET /api/v1/reports/summary`
  - Accept `from`, `to`, `group_by` query params
  - Return: total_detections, confirmed_alerts, false_positives_suppressed, by_zone array

### P3-09 — WebSocket handlers

**File:** `backend/sockets.py`

- [ ] `connect` handler — validate JWT from `auth` handshake dict
- [ ] `disconnect` handler — log session end
- [ ] Server-emitted events (called from within routes):
  - `alert_event` — emitted on confirmed drowning alert
  - `camera_status` — emitted on camera connect/disconnect (via MQTT or API)
  - `system_status` — emitted on detection engine status change

### P3-10 — MJPEG stream endpoint

**File:** `backend/routes/cameras.py` (add to existing)

- [ ] `GET /api/v1/cameras/<zone_id>/stream` — proxy MJPEG stream from camera
  - Use `cv2.VideoCapture(rtsp_url)` as a streaming source
  - Yield JPEG frames as multipart response: `multipart/x-mixed-replace; boundary=frame`

---

## Phase 4 — ESP32 Firmware

### P4-01 — Config header

**File:** `esp32/aquaguard_esp32/config.h`

- [ ] Define: `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT`, `ALARM_PIN`, `ALARM_DURATION_MS`, `DEVICE_ID`

### P4-02 — Main firmware

**File:** `esp32/aquaguard_esp32/aquaguard_esp32.ino`

- [ ] Wi-Fi connection in `setup()` with retry loop
- [ ] MQTT connection with `PubSubClient`, reconnect loop in `loop()`
- [ ] Subscribe to `aquaguard/alert` and `aquaguard/alert/reset`
- [ ] `callback()` function:
  - On `aquaguard/alert`: parse JSON, drive `ALARM_PIN` HIGH, wait `ALARM_DURATION_MS`, drive LOW
  - On `aquaguard/alert/reset`: drive `ALARM_PIN` LOW immediately
- [ ] Heartbeat: every 30 seconds publish `{"device_id": DEVICE_ID, "status": "online", "uptime_ms": millis()}` to `aquaguard/device/status`

---

## Phase 5 — React Dashboard

### P5-01 — Project setup

- [ ] Initialize React app (CRA), install all dependencies from TECH_STACK_LOCK.md
- [ ] Configure Tailwind CSS
- [ ] Create `frontend/.env`:

  ```env
  REACT_APP_API_URL=http://localhost:5000
  REACT_APP_WS_URL=http://localhost:5000
  ```

- [ ] Create `frontend/src/utils/constants.js` immediately after — **all other files must import from here, never hardcode URLs:**

  ```javascript
  export const API_BASE_URL = process.env.REACT_APP_API_URL;
  export const WS_URL       = process.env.REACT_APP_WS_URL;
  ```

- [ ] Create `frontend/src/hooks/useApi.js` — Axios instance with `baseURL` from `constants.js` and JWT interceptor:

  ```javascript
  import axios from 'axios';
  import { API_BASE_URL } from '../utils/constants';

  const api = axios.create({ baseURL: API_BASE_URL });
  api.interceptors.request.use(config => {
      const token = localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
  });
  export default api;
  ```

- [ ] All components must import `api` from `useApi.js` for HTTP calls — never use raw `axios` or `fetch` with hardcoded URLs in component files

### P5-02 — Auth context and routing

- [ ] Implement `AuthContext.js` — store JWT in localStorage, expose `login()`, `logout()`, `currentUser`
- [ ] Implement `PrivateRoute` in `App.js` — redirect to `/login` if no token
- [ ] Implement `LoginPage.js` — form, call `POST /api/v1/auth/login`, store token, redirect to `/`

### P5-03 — WebSocket hook

**File:** `frontend/src/hooks/useAlertSocket.js`

- [ ] Connect to Socket.IO with JWT in auth: `{ auth: { token: localStorage.getItem('token') } }`
- [ ] Listen for `alert_event` — call provided `onAlert` callback
- [ ] Listen for `camera_status` — call provided `onCameraStatus` callback
- [ ] Cleanup on component unmount

### P5-04 — Alert context

**File:** `frontend/src/context/AlertContext.js`

- [ ] Wrap app with AlertProvider
- [ ] State: `activeAlert` (null or alert payload), `alertHistory` (array)
- [ ] On `alert_event` socket: set `activeAlert`, prepend to `alertHistory`
- [ ] `acknowledge(alertId)` — call `POST /api/v1/alerts/<id>/acknowledge`, clear `activeAlert`

### P5-05 — Layout

- [ ] Implement `Sidebar.js` — navigation links: Dashboard, Incidents, Analytics, System
- [ ] Implement `TopBar.js` — show logged-in user, logout button, unacknowledged alert badge count
- [ ] Implement `DashboardPage.js` — grid layout combining all panels

### P5-06 — Camera grid

- [ ] Implement `CameraGrid.js` — fetch `GET /api/v1/cameras`, render `CameraCard` per camera
- [ ] Implement `CameraCard.js`
  - Display camera zone name and location
  - Show MJPEG stream via `<img src="/api/v1/cameras/{zone_id}/stream" />`
  - Green/red status indicator based on `is_active`

### P5-07 — Alert panel

- [ ] Implement `AlertPanel.js`
  - Render full-screen red overlay when `activeAlert !== null`
  - Show: zone name, timestamp, confidence score (formatted as %), frame snapshot
  - Play alert audio using `new Audio('/alert.mp3').play()`
  - "Acknowledge" button calls `AlertContext.acknowledge()`
- [ ] Implement `AlertBadge.js` — red badge with count of unacknowledged alerts

### P5-08 — Incident tables

- [ ] Implement `AlertHistory.js` — paginated table from `GET /api/v1/alerts`, columns: time, zone, confidence, status, acknowledged by
- [ ] Implement `IncidentHistory.js` — paginated table from `GET /api/v1/events`, columns: time, zone, class, confidence, alert triggered

### P5-09 — Analytics chart

- [ ] Implement `AnalyticsChart.js`
  - Fetch `GET /api/v1/reports/summary?group_by=zone`
  - Render Recharts `BarChart` of alert counts per zone
  - Render Recharts `LineChart` of detections over time (last 7 days)

### P5-10 — System status

- [ ] Implement `SystemStatus.js`
  - Camera status: from `camera_status` WebSocket events
  - ESP32 status: fetch `GET /api/v1/alerts` for last heartbeat timestamp, show "Online" if within 90 seconds
  - Detection engine status: from `system_status` WebSocket event

---

## Phase 6 — Integration and Testing

### P6-01 — Integration setup

- [ ] Create `scripts/test_mqtt.py` — publish a mock `aquaguard/alert` MQTT message and verify ESP32 receives it
- [ ] Create `scripts/test_camera.py` — verify RTSP/webcam connection and print frame shape
- [ ] Create `scripts/start_dev.sh` — start Mosquitto, Flask backend, React dev server in sequence

### P6-02 — Backend unit tests

**Files:** `backend/tests/`

- [ ] **Create `conftest.py` FIRST before any test file** — all test files depend on its fixtures. Full implementation is in IMPLEMENTATION_PLAN.md Section 6.4. It provides: `app`, `client`, `db`, `admin_token`, `lifeguard_token` fixtures using an in-memory SQLite test database.
- [ ] `test_auth.py` — login success, login failure (wrong password), login failure (missing fields), token refresh
- [ ] `test_events.py` — POST valid event, POST event with alert_triggered=true, GET events with filters
- [ ] `test_alerts.py` — GET unacknowledged, POST acknowledge, verify DB update
- [ ] `test_cameras.py` — GET cameras, POST new camera (admin), POST (lifeguard → 403)
- [ ] `test_reports.py` — summary with date range filter

### P6-03 — Detection engine unit tests

**Files:** `detection_engine/tests/`

- [ ] `test_detector.py` — valid frame detection (mock YOLO), empty frame returns empty list
- [ ] `test_pose_estimator.py` — valid ROI, bbox beyond frame bounds (edge case), None when no pose
- [ ] `test_behavior_analyzer.py` — test each of 5 indicators independently using mock landmarks
- [ ] `test_confidence_filter.py`
  - Buffer not full → False
  - Mean < threshold → False
  - Mean > threshold but K frames not met → False
  - Mean > threshold AND K frames met → True
  - Second call after True (buffer reset) → False

### P6-04 — End-to-end latency test

- [ ] Create `scripts/latency_test.py`:
  - Load a test video file with simulated drowning clip
  - Run through full pipeline (detector → pose → analyzer → filter → alert dispatch)
  - Measure wall-clock time from first frame to alert dispatch
  - Print result — must be ≤ 3000ms

### P6-05 — Field test checklist

Run this checklist live with a camera attached:

- [ ] Camera RTSP (or webcam) connects successfully
- [ ] YOLOv11s detects a person standing in frame
- [ ] MediaPipe landmarks visible in debug overlay (enable with `--debug` flag in `main.py`)
- [ ] Confidence scores increment when test drowning posture held
- [ ] Alert triggers after ~10 confirmed frames (~0.5–1 second at 15 FPS)
- [ ] ESP32 alarm activates within 200ms of MQTT publish
- [ ] Dashboard shows alert overlay within 500ms of WebSocket emit
- [ ] Database record created with correct timestamp and zone_id
- [ ] Acknowledge button clears the alert overlay
- [ ] No alert fires during 60 seconds of normal swimming motion

---

## Backlog — Post-Integration Improvements

### B-01 — Debug overlay mode

- [ ] Add `--debug` flag to `detection_engine/main.py`
- [ ] When enabled: draw bounding boxes, pose landmarks, confidence score, and filter state on each frame via OpenCV
- [ ] Display in a `cv2.imshow()` window labeled with zone_id

### B-02 — Stale track cleanup

- [ ] In `BehaviorAnalyzer` and `ConfidenceFilter`, add `cleanup_stale_tracks(active_track_ids: List[str])` method
- [ ] Call from main loop after each frame cycle to remove tracks no longer being detected (prevents memory growth over long sessions)

### B-03 — Alert sound asset

- [ ] Add `frontend/public/alert.mp3` — short alarm sound file
- [ ] Play on `AlertPanel.js` mount when `activeAlert !== null`

### B-04 — Multi-camera batch inference

- [ ] Modify `detection_engine/main.py` to collect one frame from each camera before running inference
- [ ] Pass frames as a list to `model(frames_batch, device="cuda")` for batched GPU inference
- [ ] Requires careful mapping of batch output back to camera zone_ids

### B-05 — Docker Compose production config

- [ ] Finalize `docker-compose.yml` with all 5 services
- [ ] Add Nginx config for serving React build on port 80
- [ ] Add health checks for Flask API and Mosquitto
- [ ] Test full stack via Docker Compose on development machine

---

## Task Count Summary

| Phase | Tasks | Status |
|---|---|---|
| Phase 1 — Setup | 5 tasks, 20 subtasks | [ ] |
| Phase 2 — Detection Engine | 11 tasks | [ ] |
| Phase 3 — Flask Backend | 10 tasks | [ ] |
| Phase 4 — ESP32 Firmware | 2 tasks | [ ] |
| Phase 5 — React Dashboard | 10 tasks | [ ] |
| Phase 6 — Integration & Testing | 5 tasks | [ ] |
| Backlog | 5 tasks | [ ] |
| **Total** | **48 tasks** | |