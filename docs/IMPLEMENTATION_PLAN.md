# AquaGuard — Implementation Plan

> This file is the primary execution guide for the Claude agent building
AquaGuard.
> Read this first before any other file. Follow phases in order. Do not skip
ahead.

______________________________________________________________________

## Project Context

- **System:** AquaGuard — IoT-Based Drowning Detection and Real-Time Alert
  System
- **Detection Model:** YOLOv11s fine-tuned on Roboflow Swimming and Drowning
  Detection dataset (trained on Kaggle)
- **Hardware:** Lenovo LOQ 15IAX9E — RTX 2050 4GB GDDR6, Intel i5-12450HX, 8GB
  DDR5
- **IoT Device:** ESP32-WROOM-32 with buzzer/relay alarm via GPIO
- **Backend:** Python Flask + Flask-SocketIO
- **Frontend:** React.js web dashboard
- **Database:** SQLite (development) → MySQL (production)
- **Messaging:** Eclipse Mosquitto MQTT broker
- **Goal:** Detect drowning from camera feed and trigger physical alarm +
  dashboard alert within 3 seconds

______________________________________________________________________

## Phase 1 — Environment Setup

### 1.1 Python Environment

> **Note:** A venv (virtual environment) named `aquaguard_env` already exists
with `ultralytics` installed.
> Do NOT create a new environment or reinstall ultralytics/PyTorch — this will
break the existing CUDA configuration.

Activate the existing environment:

```bash

.\aquaguard_env\Scripts\Activate.ps1

```

Verify CUDA is working before installing anything else:

```python

import torch
assert torch.cuda.is_available(), "CUDA not found — check PyTorch CUDA installation"
print(torch.cuda.get_device_name(0))  # Expected: NVIDIA GeForce RTX 2050

```

If CUDA returns `False`, do NOT reinstall PyTorch blindly. Check the driver
first:

```bash

nvidia-smi   # confirms driver and CUDA version

```

Install remaining dependencies that ultralytics does not include — run inside
`aquaguard_env`:

```bash

pip install mediapipe==0.10.14
pip install flask==3.0.3 flask-socketio==5.3.6 flask-jwt-extended==4.6.0
pip install flask-sqlalchemy==3.1.1 flask-migrate==4.0.7 flask-cors==4.0.1 flask-bcrypt==1.0.1
pip install python-socketio==5.11.3 python-engineio==4.9.1
pip install paho-mqtt==2.1.0
pip install python-dotenv==1.0.1 pymysql==1.1.1 requests==2.32.3
pip install pytest==8.3.3 pytest-cov==5.0.0 pytest-mock==3.14.0

```

Verify all key installs:

```bash

python -c "from ultralytics import YOLO; print('YOLO OK')"
python -c "import mediapipe; print('MediaPipe OK')"
python -c "import flask; print('Flask', flask.**version**)"
python -c "import paho.mqtt; print('paho-mqtt OK')"
python -c "import cv2; print('OpenCV', cv2.**version**)"

```

> **requirements.txt** should still be committed to the repo for documentation
purposes, but the agent must NOT run `pip install -r requirements.txt` from
scratch — only install missing packages individually as listed above.

### 1.2 Node.js Environment

Node.js is installed system-wide — it does not go inside `aquaguard_env`.
Install frontend dependencies:

```bash

cd frontend
npm install

```

### 1.3 MQTT Broker Setup

Download and install Eclipse Mosquitto. Place config at `mqtt/mosquitto.conf`:

```text

listener 1883
allow_anonymous true

```

Start the broker:

```bash

mosquitto -c mqtt/mosquitto.conf

```

### 1.4 Model Weights

Place the Kaggle-trained model weights at:

```text

detection_engine/models/aquaguard_yolov11s.pt

```

Verify the model loads:

```python

from ultralytics import YOLO
model = YOLO("detection_engine/models/aquaguard_yolov11s.pt")
model.info()

```

______________________________________________________________________

## Phase 2 — Detection Engine

### 2.1 Camera Capture Module

**File:** `detection_engine/camera/capture.py`

Implement `CameraCapture` class:

- Accept RTSP URL or integer (webcam index) as input
- Run in a dedicated thread per camera
- Expose a `read()` method returning the latest frame and metadata
- On stream failure, enter exponential backoff reconnect loop (1s → 2s → 4s →
  8s → 30s max)
- Log camera connect/disconnect events to `system_logs` via the Flask API

### 2.2 YOLOv11 Inference Module

**File:** `detection_engine/vision/detector.py`

Implement `DrowningDetector` class:

- Load `aquaguard_yolov11s.pt` on initialization, assign to `device="cuda"`
- Expose `detect(frame)` method
- Use `model.track(frame, persist=True, conf=0.4, device="cuda",
  verbose=False)` for multi-object tracking across frames
- Return a list of `Detection` dataclass objects: `(track_id, class_label,
  confidence, bbox)`
- Classes to recognize: `drowning`, `swimming`, `person_out_of_water`

### 2.3 Pose Estimation Module

**File:** `detection_engine/vision/pose_estimator.py`

Implement `PoseEstimator` class:

- Initialize `mediapipe.solutions.pose.Pose(min_detection_confidence=0.5,
  min_tracking_confidence=0.5)`
- Expose `estimate(frame, bbox)` method — crops the ROI from `bbox`, runs pose
  on the crop
- Return list of 33 `Landmark(x, y, z, visibility)` objects or `None` if pose
  not detected
- Key landmark indices to extract: 0 (nose), 11–16 (shoulders/elbows/wrists),
  23–28 (hips/knees/ankles)

### 2.4 Drowning Behavior Analyzer

**File:** `detection_engine/analysis/behavior_analyzer.py`

Implement `BehaviorAnalyzer` class with `analyze(landmarks, yolo_class,
yolo_confidence)` method.

Five weighted indicators — return a `float` score in `[0.0, 1.0]`:

```text

score = 0.0
score += 0.30  if is_vertical_orientation(landmarks)
score += 0.25  if are_arms_elevated(landmarks)
score += 0.20  if no_limb_motion(track_id, landmarks)   # requires history
score += 0.15  if is_face_submerged(landmarks)
score += 0.10  if (yolo_class == "drowning" and yolo_confidence > 0.6)

```

Also apply temporal consistency bonus:

- Compute ratio of last 5 history entries that exceeded 0.5
- Multiply final score by `(1.0 + 0.1 * temporal_ratio)` — capped at 1.0

Maintain per-`track_id` landmark history (deque maxlen=10) for the limb motion
check.

### CRITICAL — MediaPipe coordinate system

MediaPipe Pose returns **normalized coordinates in [0.0, 1.0]** relative to the
ROI dimensions — NOT pixel values. All threshold comparisons must use normalized
units, not pixels. To convert to pixels for debug display only: `px = landmark.x

- roi_width`.

Indicator thresholds — all in **normalized units**:

- **Vertical orientation:** angle between (shoulder_midpoint → hip_midpoint)
  vector and vertical axis `< 30°`
  - Use `np.arctan2(dx, dy)` where dx/dy are differences of normalized x/y
    coords — angle calculation is unit-independent
- **Arms elevated:** both `wrist.y < shoulder.y` in image coordinates (smaller
  Y = higher in frame) — normalized comparison is valid as-is
- **No limb motion:** `std_dev` of wrist_x and ankle_x positions across last
  10 frames `< 0.015` (normalized equivalent of ~15px in a 1000px-wide frame)
- **Face submerged:** `nose.visibility < 0.4`

```python

# CORRECT — normalized threshold

LIMB_MOTION_STD_THRESHOLD = 0.015   # in config/settings.py

# WRONG — never do this

LIMB_MOTION_STD_THRESHOLD_PX = 15   # MediaPipe does NOT return pixels

```

## 2.5 False Positive Filter

**File:** `detection_engine/analysis/confidence_filter.py`

Implement `ConfidenceFilter` class:

- Maintain a `Dict[track_id, deque(maxlen=15)]` confidence buffer
- Expose `evaluate(track_id, score) -> bool`
- Return `True` (alert) only when:
  - `mean(buffer) > 0.75` AND
  - `count(score > 0.65 for score in buffer[-10:]) >= 10`
- On returning `True`, reset the buffer for that `track_id` to prevent
  repeated alerts

### 2.6 Alert Decision Engine

**File:** `detection_engine/alert/alert_engine.py`

Implement `AlertEngine` class:

- Accept `MQTTClient`, `APIClient`, `snapshot_dir` as constructor dependencies
- `snapshot_dir` is resolved by `main.py` using `**file**` — never hardcode a
  relative path here
- Expose `dispatch(camera_zone_id, track_id, confidence, frame)` method
- Build alert payload (see API Design in system design doc)
- Encode frame snapshot as JPEG bytes using `cv2.imencode('.jpg', frame)`
- Save snapshot to `snapshot_dir/{event_id}.jpg` on disk
- Encode same JPEG as base64 string for the API payload
- Dispatch simultaneously in 3 daemon threads: MQTT publish, Flask POST, local
  log

**CRITICAL — snapshot path resolution:** The detection engine and Flask backend
are separate processes. The detection engine must write snapshots to an absolute
path that the Flask backend can also read. Resolve this in `main.py` before
instantiating `AlertEngine`:

```python

# detection_engine/main.py

import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(**file**)))
SNAPSHOT_DIR = os.path.join(BASE_DIR, 'backend', 'snapshots')
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

alert_engine = AlertEngine(mqtt_client, api_client, snapshot_dir=SNAPSHOT_DIR)

```

```python

# detection_engine/alert/alert_engine.py

import cv2, uuid, base64, os, threading
from datetime import datetime, timezone

class AlertEngine:
    def **init**(self, mqtt_client, api_client, snapshot_dir: str):
        self.mqtt    = mqtt_client
        self.api     = api_client
        self.snap_dir = snapshot_dir

    def dispatch(self, zone_id, track_id, score, frame):
        event_id     = str(uuid.uuid4())
        timestamp    = datetime.now(timezone.utc).isoformat()
        snap_path    = os.path.join(self.snap_dir, f"{event_id}.jpg")

        _, buf        = cv2.imencode('.jpg', frame)
        with open(snap_path, 'wb') as f:
            f.write(buf.tobytes())
        snapshot_b64 = base64.b64encode(buf).decode('utf-8')

        payload = {
            "event_id": event_id, "camera_zone_id": zone_id,
            "timestamp": timestamp, "confidence_score": score,
            "person_track_id": track_id, "frame_snapshot_b64": snapshot_b64,
            "alert_triggered": True
        }
        threading.Thread(target=self.mqtt.publish_alert, args=(payload,), daemon=True).start()
        threading.Thread(target=self.api.log_event,      args=(payload,), daemon=True).start()

```

## 2.8 MQTT Client

**File:** `detection_engine/alert/mqtt_client.py`

**CRITICAL — paho-mqtt 2.x breaking change:** Version 2.x requires
`CallbackAPIVersion.VERSION2` and uses different callback signatures from 1.x.
Write all callbacks with the new signatures shown below — the old 3-argument
signatures will raise a `TypeError` at runtime.

```python

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

class MQTTClient:
    def **init**(self, broker_host: str, broker_port: int):
        # VERSION2 is mandatory in paho-mqtt 2.x
        self.client = mqtt.Client(CallbackAPIVersion.VERSION2)
        self.client.on_connect    = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.broker_host = broker_host
        self.broker_port = broker_port

    # paho-mqtt 2.x signature — 5 args (was 4 in 1.x)
    def _on_connect(self, client, userdata, connect_flags, reason_code, properties):
        if reason_code == 0:
            logger.info("MQTT connected to broker")
        else:
            logger.error(f"MQTT connect failed: reason_code={reason_code}")

    # paho-mqtt 2.x signature — 4 args (was 3 in 1.x)
    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        logger.warning(f"MQTT disconnected: {reason_code}. Reconnecting in 5s...")
        import time; time.sleep(5)
        self._reconnect()

    def connect(self):
        self.client.connect(self.broker_host, self.broker_port, keepalive=60)
        self.client.loop_start()   # runs MQTT loop in background thread

    def publish_alert(self, payload: dict):
        import json
        self.client.publish(
            topic=MQTT_TOPIC_ALERT,
            payload=json.dumps(payload),
            qos=1
        )

    def _reconnect(self):
        try:
            self.client.reconnect()
        except Exception as e:
            logger.error(f"Reconnect failed: {e}")

```

**File:** `detection_engine/main.py`

**CRITICAL — one `DrowningDetector` instance per camera:** YOLOv11's
`persist=True` tracking maintains internal state (ByteTrack) that is tied to a
single sequential stream. Passing frames from different cameras to the same
detector in alternating order will corrupt the tracker — it will assign wrong
track IDs and lose tracks immediately. Each camera must have its own dedicated
`DrowningDetector` instance.

```python

# WRONG — single detector shared across cameras

detector = DrowningDetector(model_path)
for zone_id, camera in registry.cameras.items():
    frame, meta = camera.read()
    detections = detector.detect(frame)   # ← corrupts ByteTrack state

# CORRECT — one detector per camera zone

detectors = {
    zone_id: DrowningDetector(model_path)
    for zone_id in registry.cameras.keys()
}

```

Full main loop structure:

```python

# detection_engine/main.py

import os, sys
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(**file**)))
SNAPSHOT_DIR = os.path.join(BASE_DIR, 'backend', 'snapshots')

registry   = CameraRegistry.load_from_json('config/cameras.json')
detectors  = {z: DrowningDetector(MODEL_PATH) for z in registry.cameras}
pose       = PoseEstimator()
analyzer   = BehaviorAnalyzer()
filt       = ConfidenceFilter()
alert_eng  = AlertEngine(MQTTClient(...), APIClient(...), snapshot_dir=SNAPSHOT_DIR)

registry.start_all()
try:
    while True:
        for zone_id, camera in registry.cameras.items():
            frame, metadata = camera.read()
            if frame is None:
                continue
            detections = detectors[zone_id].detect(frame)
            for det in detections:
                landmarks = pose.estimate(frame, det.bbox)
                if landmarks is None:
                    continue
                score = analyzer.analyze(landmarks, det.class_label,
                                         det.confidence, det.track_id)
                if filt.evaluate(det.track_id, score):
                    alert_eng.dispatch(zone_id, det.track_id, score, frame)
except KeyboardInterrupt:
    registry.stop_all()

```

Note the `SNAPSHOT_DIR` resolution using `**file**` — this is the correct
cross-process path resolution (see gap fix in Section 2.6).

Support loading camera config from `config/cameras.json`.

______________________________________________________________________

## Phase 3 — Flask Backend API

### 3.1 App Initialization

**File:** `backend/app.py`

Initialize Flask, Flask-SocketIO, Flask-JWT-Extended, SQLAlchemy. Register all
blueprints. Configure CORS for React dev server (`localhost:3000`).

**CRITICAL — Flask-SocketIO async mode:** Always initialize SocketIO with
`async_mode='threading'`. Without this, the WebSocket server will not work
correctly with Flask's development server or with Gunicorn threaded workers.

```python

# backend/extensions.py

from flask_socketio import SocketIO
socketio = SocketIO(cors_allowed_origins="*", async_mode='threading')

# backend/app.py

from extensions import db, jwt, socketio, bcrypt, migrate, cors
def create_app():
    app = Flask(**name**)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
    db.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app, cors_allowed_origins="*", async_mode='threading')
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, origins=["http://localhost:3000"])
    # register blueprints here
    return app

```

**CRITICAL — emitting from inside a route:** Import the `socketio` instance from
`extensions.py` directly in your route file. Do not re-initialize SocketIO
inside a route. The correct pattern is:

```python

# backend/routes/events.py

from extensions import socketio   # import the shared instance

@events_bp.route('/api/v1/events', methods=['POST'])
def log_event():
    # ... save to DB ...
    if data.get('alert_triggered'):
        alert = Alert(...)
        db.session.add(alert)
        db.session.commit()
        # Emit AFTER commit so alert_id exists
        socketio.emit('alert_event', alert.to_dict())  # correct
    return jsonify({'event_id': event.id}), 201

```

## 3.2 Database Models

**File:** `backend/models.py`

Define SQLAlchemy models matching the ER diagram in the system design doc:

- `User` — id, username, password_hash, role, email, created_at, last_login,
  is_active
- `CameraZone` — id, zone_name, rtsp_url, location_description, frame_rate,
  resolution, is_active, registered_at
- `DetectionEvent` — id, zone_id (FK), detected_at, class_label,
  yolo_confidence, pose_confidence, final_confidence, person_track_id,
  frame_snapshot_path, alert_triggered
- `Alert` — id, event_id (FK), zone_id (FK), acknowledged_by (FK), alerted_at,
  acknowledged_at, status, alert_type, mqtt_payload
- `SystemLog` — id, zone_id (FK nullable), logged_at, log_level,
  source_module, message, session_id

Add indexes on: `detected_at`, `zone_id`, `status`, `alert_triggered`.

### 3.3 Authentication Blueprint

**File:** `backend/routes/auth.py`

- `POST /api/v1/auth/login` — validate credentials, return JWT access token +
  refresh token
- `POST /api/v1/auth/refresh` — return new access token using refresh token
- `POST /api/v1/auth/logout` — invalidate refresh token

Use `bcrypt` for password hashing. JWT expiry: access=60min, refresh=7days.

### 3.4 Events Blueprint

**File:** `backend/routes/events.py`

- `POST /api/v1/events` — internal endpoint (no auth required from LAN, or use
  a shared API key); log detection event to DB; if `alert_triggered=true`,
  create Alert record
- `GET /api/v1/events` — paginated event list; supports query params:
  `zone_id`, `from`, `to`, `alert_triggered`, `page`, `limit`

### 3.5 Alerts Blueprint

**File:** `backend/routes/alerts.py`

- `GET /api/v1/alerts` — list alerts; supports `?status=unacknowledged`
- `POST /api/v1/alerts/<alert_id>/acknowledge` — set status to `acknowledged`,
  record user and timestamp

### 3.6 Cameras Blueprint

**File:** `backend/routes/cameras.py`

- `GET /api/v1/cameras` — list all camera zones
- `POST /api/v1/cameras` — register a new camera zone (admin only)
- `PUT /api/v1/cameras/<zone_id>` — update camera config (admin only)
- `DELETE /api/v1/cameras/<zone_id>` — deactivate camera (admin only)

### 3.7 Reports Blueprint

**File:** `backend/routes/reports.py`

- `GET /api/v1/reports/summary` — aggregated incident counts grouped by zone
  and time range

### 3.8 WebSocket Events

**File:** `backend/sockets.py`

Define Socket.IO event handlers:

- `connect` — validate JWT from query param or handshake auth
- `disconnect` — log session end
- Server-emitted events: `alert_event`, `camera_status`, `system_status`

The Flask backend emits `alert_event` when `POST /api/v1/events` receives an
`alert_triggered=true` payload.

______________________________________________________________________

## Phase 4 — ESP32 Firmware

**File:** `esp32/aquaguard_esp32/aquaguard_esp32.ino`

### Required Libraries (Arduino IDE)

- `WiFi.h` (built-in)
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon

### Firmware Behavior

1. Connect to Wi-Fi using credentials in `config.h`
1. Connect to MQTT broker at configured IP, port 1883
1. Subscribe to `aquaguard/alert` (QoS 1) and `aquaguard/alert/reset`
1. On `aquaguard/alert` received: drive `ALARM_PIN` HIGH for `ALARM_DURATION_MS`
1. Publish heartbeat JSON to `aquaguard/device/status` every 30 seconds
1. On Wi-Fi or MQTT disconnect: enter reconnect loop, retry every 5 seconds

### Config File

**File:** `esp32/aquaguard_esp32/config.h`

```cpp

#define WIFI_SSID       "your_wifi_ssid"
#define WIFI_PASSWORD   "your_wifi_password"
#define MQTT_BROKER     "192.168.1.x"   // Edge server LAN IP
#define MQTT_PORT       1883
#define ALARM_PIN       26
#define ALARM_DURATION_MS 30000
#define DEVICE_ID       "ESP32_AquaGuard_01"

```

______________________________________________________________________

## Phase 5 — React Dashboard

### 5.1 Project Setup

```bash

npx create-react-app frontend --template cra-template
cd frontend
npm install axios socket.io-client recharts react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

```

**Create `frontend/.env`** — CRA automatically exposes variables prefixed with
`REACT_APP_`:

```env

REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000

```

### How to consume `.env` values in React code

```javascript

// frontend/src/utils/constants.js
export const API_BASE_URL = process.env.REACT_APP_API_URL;
export const WS_URL       = process.env.REACT_APP_WS_URL;

// frontend/src/hooks/useApi.js — Axios instance with base URL from .env
import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

const api = axios.create({ baseURL: API_BASE_URL });

// Inject JWT token into every request automatically
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default api;

// frontend/src/hooks/useAlertSocket.js — Socket.IO with .env URL
import { io } from 'socket.io-client';
import { WS_URL } from '../utils/constants';

export function useAlertSocket(onAlert, onCameraStatus) {
    useEffect(() => {
        const socket = io(WS_URL, {
            auth: { token: localStorage.getItem('token') }
        });
        socket.on('alert_event',    onAlert);
        socket.on('camera_status',  onCameraStatus);
        return () => socket.disconnect();
    }, [onAlert, onCameraStatus]);
}

```

**NEVER hardcode `http://localhost:5000` directly in component files.** Always
import from `constants.js`.

### 5.2 Component Structure

See REPO_STRUCTURE.md for file locations. Implement in this order:

1. **AuthContext + PrivateRoute** — JWT storage, login redirect
1. **LoginPage** — form calling `POST /api/v1/auth/login`, store token
1. **Layout / Sidebar** — navigation between dashboard sections
1. **CameraGrid** — fetch `GET /api/v1/cameras`, display MJPEG stream per camera
1. **AlertPanel** — connect WebSocket, render full-screen overlay on
   `alert_event`
1. **AlertAcknowledgeButton** — call `POST /api/v1/alerts/<id>/acknowledge`
1. **DetectionFeed** — scrolling live list of WebSocket detection events
1. **IncidentHistory** — paginated table from `GET /api/v1/events`
1. **AnalyticsChart** — Recharts `LineChart` from `GET /api/v1/reports/summary`
1. **SystemStatus** — display camera status, MQTT status, ESP32 heartbeat age

### 5.3 WebSocket Hook

**File:** `frontend/src/hooks/useAlertSocket.js`

Connect to Flask-SocketIO with JWT auth. Listen for `alert_event` and
`camera_status` events. Expose alert state via React context.

______________________________________________________________________

## Phase 6 — Integration and Docker

### 6.1 Environment Variables

Create `backend/.env`:

```env

DATABASE_URL=sqlite:///aquaguard.db
JWT_SECRET_KEY=generate_with_secrets_module
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
FLASK_ENV=development

```

### 6.2 Database Initialization

```bash

cd backend
flask db init
flask db migrate -m "initial schema"
flask db upgrade
python seed.py    # creates default admin user

```

### `seed.py` — exact bcrypt pattern to use with Flask-Bcrypt

```python

# backend/seed.py

from app import create_app
from extensions import db, bcrypt
from models import User, CameraZone

app = create_app()

with app.app_context():
    db.create_all()

    # Flask-Bcrypt: use bcrypt.generate_password_hash(), decode to str
    admin_hash = bcrypt.generate_password_hash('aquaguard2026').decode('utf-8')
    lf_hash    = bcrypt.generate_password_hash('lifeguard123').decode('utf-8')

    if not User.query.filter_by(username='admin').first():
        db.session.add(User(
            username='admin', password_hash=admin_hash,
            role='admin', email='admin@aquaguard.local', is_active=True
        ))
    if not User.query.filter_by(username='lifeguard').first():
        db.session.add(User(
            username='lifeguard', password_hash=lf_hash,
            role='lifeguard', email='lifeguard@aquaguard.local', is_active=True
        ))

    if not CameraZone.query.filter_by(zone_name='Dev Webcam').first():
        db.session.add(CameraZone(
            zone_name='Dev Webcam', rtsp_url='0',
            location_description='Local webcam for development',
            frame_rate=30, resolution='1280x720', is_active=True
        ))

    db.session.commit()
    print("Seed complete.")

```

## Verifying passwords at login — use `bcrypt.check_password_hash()`

```python

# backend/routes/auth.py

from extensions import bcrypt
user = User.query.filter_by(username=data['username']).first()
if user and bcrypt.check_password_hash(user.password_hash, data['password']):
    # issue JWT

```

## 6.3 start_dev.sh

**File:** `scripts/start_dev.sh`

```bash

#!/bin/bash

# AquaGuard — start all development services

# Run from the AquaGuard/ repo root

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Starting Mosquitto MQTT broker..."
mosquitto -c "$ROOT_DIR/mqtt/mosquitto.conf" -d
echo "    Mosquitto running on port 1883"

echo "==> Starting Flask backend..."
cd "$ROOT_DIR/backend"

# Activate the existing venv

.\aquaguard_env\Scripts\Activate.ps1
$env:FLASK_APP = "app.py"
$env:FLASK_ENV = "development"
python -m flask run --port=5000

echo ""
echo "All services started. Detection engine: run manually with: python detection_engine/main.py"

```

**On Windows, run each service manually in separate terminals** instead of using
this script. Make sure to run `.\aquaguard_env\Scripts\Activate.ps1` in each
terminal before starting Flask or the detection engine.

## 6.4 conftest.py — Pytest fixtures for backend tests

**File:** `backend/tests/conftest.py`

The agent must create this file before writing any backend tests. All test files
depend on these fixtures.

```python

# backend/tests/conftest.py

import pytest
from app import create_app
from extensions import db as _db
from models import User, CameraZone
from extensions import bcrypt

@pytest.fixture(scope='session')
def app():
    """Create application with test config."""
    test_app = create_app()
    test_app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key',
        'WTF_CSRF_ENABLED': False,
    })
    with test_app.app_context():
        _db.create_all()
        _seed_test_data(test_app)
        yield test_app
        _db.drop_all()

@pytest.fixture(scope='session')
def client(app):
    """Flask test client."""
    return app.test_client()

@pytest.fixture(scope='session')
def db(app):
    """Database session for tests."""
    return _db

@pytest.fixture(scope='session')
def admin_token(client):
    """JWT token for admin user."""
    resp = client.post('/api/v1/auth/login',
                       json={'username': 'testadmin', 'password': 'testpass123'})
    return resp.get_json()['access_token']

@pytest.fixture(scope='session')
def lifeguard_token(client):
    """JWT token for lifeguard user."""
    resp = client.post('/api/v1/auth/login',
                       json={'username': 'testguard', 'password': 'guardpass123'})
    return resp.get_json()['access_token']

def _seed_test_data(app):
    with app.app_context():
        admin = User(
            username='testadmin',
            password_hash=bcrypt.generate_password_hash('testpass123').decode('utf-8'),
            role='admin', email='admin@test.local', is_active=True
        )
        guard = User(
            username='testguard',
            password_hash=bcrypt.generate_password_hash('guardpass123').decode('utf-8'),
            role='lifeguard', email='guard@test.local', is_active=True
        )
        zone = CameraZone(
            zone_name='Test Zone', rtsp_url='0',
            location_description='Test camera',
            frame_rate=30, resolution='1280x720', is_active=True
        )
        _db.session.add_all([admin, guard, zone])
        _db.session.commit()

```

## 6.5 Docker Compose

Use `docker-compose.yml` at the repo root (see system design doc Section 15.2)
for production deployment. For development, run all services manually.

### 6.4 Full Integration Test Checklist

Run through these in order before declaring integration complete:

- [ ] Camera RTSP stream captured by OpenCV without drop
- [ ] YOLOv11s inference runs on CUDA (verify with `nvidia-smi` during run)
- [ ] MediaPipe landmarks extracted per detected person
- [ ] Confidence scores flowing into deque buffers correctly
- [ ] Alert triggered on simulated drowning video after ~10 confirmed frames
- [ ] MQTT message received by ESP32 within 200ms
- [ ] ESP32 GPIO alarm activates
- [ ] Flask API event record created in database
- [ ] WebSocket `alert_event` received by React dashboard
- [ ] Alert overlay rendered in dashboard
- [ ] Acknowledge button updates alert status in DB
- [ ] End-to-end latency measured and ≤ 3 seconds

______________________________________________________________________

## Phase 7 — Testing

Run unit tests:

```bash

cd backend
pytest tests/ -v --cov=. --cov-report=term-missing

```

Run React tests:

```bash

cd frontend
npm test

```

Run benchmark:

```bash

python detection_engine/benchmark.py

```

See TASK_BREAKDOWN.md for detailed test case specifications per module.

______________________________________________________________________

## Coding Standards

- Python: follow PEP 8. Use type hints on all function signatures.
- Use `dataclasses` for data transfer objects (`Detection`, `Landmark`,
  `AlertPayload`).
- All configuration values (thresholds, MQTT topics, ports) must be in
  `config/settings.py` — never hardcoded.
- Every module must have a `logger = logging.getLogger(**name**)` and log key
  events at appropriate levels.
- No synchronous blocking calls inside the main detection loop. Use threads
  for I/O operations.
- React: functional components with hooks only. No class components.
- Commit messages follow: `type(scope): description` — e.g., `feat(detector):
  add YOLOv11s CUDA inference`.
