# AquaGuard — Repository Structure

> This file defines the complete folder and file layout of the AquaGuard codebase.
> The Claude agent must create files at exactly these paths.
> Do not create files outside this structure without a documented reason.

---

```
aquaguard/
│
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
│
├── config/
│   ├── settings.py                  # All system-wide constants and thresholds
│   └── cameras.json                 # Camera zone registry (zone_id, rtsp_url, etc.)
│
├── detection_engine/                # Python CV + AI pipeline (runs on edge server)
│   ├── main.py                      # Entry point — starts all camera threads and detection loop
│   ├── benchmark.py                 # Inference timing benchmark script
│   │
│   ├── models/
│   │   └── aquaguard_yolov11s.pt    # Trained model weights (not committed to git — add to .gitignore)
│   │
│   ├── camera/
│   │   ├── __init__.py
│   │   ├── capture.py               # CameraCapture class — RTSP/webcam stream thread
│   │   └── registry.py              # CameraRegistry — hash map of zone_id → CameraCapture
│   │
│   ├── vision/
│   │   ├── __init__.py
│   │   ├── detector.py              # DrowningDetector class — YOLOv11s CUDA inference
│   │   ├── pose_estimator.py        # PoseEstimator class — MediaPipe Pose landmark extraction
│   │   └── preprocessor.py         # Frame resize, normalize, BGR→RGB conversion
│   │
│   ├── analysis/
│   │   ├── __init__.py
│   │   ├── behavior_analyzer.py     # BehaviorAnalyzer — 5-indicator rule-based scoring
│   │   └── confidence_filter.py     # ConfidenceFilter — rolling deque window (N=15, T=0.75, K=10)
│   │
│   ├── alert/
│   │   ├── __init__.py
│   │   ├── alert_engine.py          # AlertEngine — orchestrates MQTT + WebSocket + API dispatch
│   │   ├── mqtt_client.py           # MQTTClient wrapper using paho-mqtt
│   │   └── api_client.py            # APIClient — HTTP POST to Flask backend
│   │
│   ├── models_data/
│   │   ├── detection.py             # Detection dataclass (track_id, class_label, confidence, bbox)
│   │   ├── landmark.py              # Landmark dataclass (x, y, z, visibility)
│   │   └── alert_payload.py         # AlertPayload dataclass (event_id, zone_id, timestamp, etc.)
│   │
│   └── tests/
│       ├── __init__.py
│       ├── test_detector.py
│       ├── test_pose_estimator.py
│       ├── test_behavior_analyzer.py
│       └── test_confidence_filter.py
│
├── backend/                         # Flask REST API + WebSocket server
│   ├── app.py                       # Flask app factory — init extensions, register blueprints
│   ├── extensions.py                # SQLAlchemy, JWT, SocketIO instances
│   ├── models.py                    # SQLAlchemy ORM models
│   ├── seed.py                      # Create default admin user
│   ├── wsgi.py                      # WSGI entry point for production
│   ├── .env                         # Environment variables (not committed to git)
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py                  # POST /auth/login, /auth/refresh, /auth/logout
│   │   ├── events.py                # POST /events, GET /events
│   │   ├── alerts.py                # GET /alerts, POST /alerts/<id>/acknowledge
│   │   ├── cameras.py               # GET/POST/PUT/DELETE /cameras
│   │   └── reports.py               # GET /reports/summary
│   │
│   ├── sockets.py                   # Flask-SocketIO event handlers
│   ├── auth_helpers.py              # JWT decorators, role_required helper
│   │
│   ├── migrations/                  # Flask-Migrate Alembic migration files
│   │   └── versions/
│   │
│   ├── snapshots/                   # Saved JPEG frame snapshots from alert events
│   │   └── .gitkeep
│   │
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py              # Pytest fixtures — test client, test DB
│       ├── test_auth.py
│       ├── test_events.py
│       ├── test_alerts.py
│       ├── test_cameras.py
│       └── test_reports.py
│
├── esp32/                           # ESP32 Arduino firmware
│   └── aquaguard_esp32/
│       ├── aquaguard_esp32.ino      # Main firmware sketch
│       └── config.h                 # WiFi credentials, MQTT broker IP, pin definitions
│
├── frontend/                        # React web dashboard
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env                         # REACT_APP_API_URL, REACT_APP_WS_URL
│   │
│   ├── public/
│   │   └── index.html
│   │
│   └── src/
│       ├── index.js
│       ├── App.js                   # Router — public/private routes
│       │
│       ├── context/
│       │   ├── AuthContext.js       # JWT storage, login/logout, current user
│       │   └── AlertContext.js      # Global alert state from WebSocket
│       │
│       ├── hooks/
│       │   ├── useAlertSocket.js    # Socket.IO connection + alert_event listener
│       │   └── useApi.js            # Axios wrapper with JWT header injection
│       │
│       ├── pages/
│       │   ├── LoginPage.js
│       │   └── DashboardPage.js     # Main dashboard layout
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.js
│       │   │   └── TopBar.js
│       │   │
│       │   ├── camera/
│       │   │   ├── CameraGrid.js    # Grid of camera feeds
│       │   │   └── CameraCard.js    # Single camera tile with MJPEG stream + status
│       │   │
│       │   ├── alerts/
│       │   │   ├── AlertPanel.js    # Full-screen alert overlay on drowning event
│       │   │   ├── AlertBadge.js    # Unacknowledged alert count indicator
│       │   │   └── AlertHistory.js  # Paginated table of past alerts
│       │   │
│       │   ├── events/
│       │   │   ├── DetectionFeed.js # Live scrolling detection event log
│       │   │   └── IncidentHistory.js # Filterable paginated event table
│       │   │
│       │   ├── analytics/
│       │   │   └── AnalyticsChart.js # Recharts detection frequency over time
│       │   │
│       │   └── system/
│       │       └── SystemStatus.js  # Camera, MQTT, ESP32 health indicators
│       │
│       └── utils/
│           ├── dateFormat.js        # Timestamp formatting helpers
│           └── constants.js         # API base URL, Socket URL, MQTT topics
│
├── mqtt/
│   └── mosquitto.conf               # Mosquitto broker configuration
│
├── docs/
│   ├── AquaGuard_System_Design.md   # Main system design document
│   ├── IMPLEMENTATION_PLAN.md       # This agent's implementation guide
│   ├── REPO_STRUCTURE.md            # This file
│   ├── TECH_STACK_LOCK.md           # Exact dependency versions
│   └── TASK_BREAKDOWN.md            # Granular task list per module
│
└── scripts/
    ├── start_dev.sh                 # Starts all services for local development
    ├── test_mqtt.py                 # Manually publish a test MQTT alert
    └── test_camera.py               # Verify RTSP stream connection
```
---

## .gitignore Entries

```gitignore
# Python
venv/
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.egg-info/
dist/
build/

# Model weights (large binary files)
detection_engine/models/*.pt
detection_engine/models/*.onnx

# Environment files
.env
backend/.env
frontend/.env

# Database
*.db
*.sqlite3

# Snapshots (generated at runtime)
backend/snapshots/*.jpg
backend/snapshots/*.jpeg

# Node
frontend/node_modules/
frontend/build/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
```
---

## cameras.json Format

```json
{
  "cameras": [
    {
      "zone_id": "zone_01",
      "zone_name": "Main Pool - East",
      "rtsp_url": "rtsp://192.168.1.10/stream1",
      "location_description": "East side, overhead angle, full pool coverage",
      "frame_rate": 30,
      "resolution": "1280x720"
    },
    {
      "zone_id": "zone_02",
      "zone_name": "Kiddie Pool",
      "rtsp_url": "rtsp://192.168.1.11/stream1",
      "location_description": "Kiddie pool, overhead angle",
      "frame_rate": 15,
      "resolution": "1280x720"
    }
  ]
}
```
For local development with a webcam instead of RTSP:

```json
{
  "cameras": [
    {
      "zone_id": "zone_dev",
      "zone_name": "Dev Webcam",
      "rtsp_url": 0,
      "location_description": "Local webcam for development testing",
      "frame_rate": 30,
      "resolution": "1280x720"
    }
  ]
}
```
---

## Key Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Python files | snake_case | `behavior_analyzer.py` |
| Python classes | PascalCase | `BehaviorAnalyzer` |
| Python functions/methods | snake_case | `evaluate_confidence()` |
| Python constants | UPPER_SNAKE | `CONFIDENCE_THRESHOLD` |
| React components | PascalCase | `AlertPanel.js` |
| React hooks | camelCase prefixed `use` | `useAlertSocket.js` |
| React context files | PascalCase + Context | `AlertContext.js` |
| Database tables | snake_case plural | `detection_events` |
| API routes | kebab-case | `/acknowledge-alert` |
| MQTT topics | slash-separated lowercase | `aquaguard/alert` |
| Environment variables | UPPER_SNAKE | `JWT_SECRET_KEY` |
