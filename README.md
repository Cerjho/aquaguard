# AquaGuard — IoT-Based Drowning Detection System

Real-time drowning detection using YOLOv11 + MediaPipe Pose, ESP32 physical alarm, and React dashboard. Detects drowning events within 3 seconds.

---

## Team

| Role | Member |

|------|--------|
| Project Manager / Requirements Analyst | Jarvy Joy Longenos |
| System Designer / Architect | Joshua Gutierrez |
| AI/CV Developer (Python / YOLOv11) | Jhocer Barcela |
| Hardware Developer (ESP32) | Dranreb Wen Balangbang |
| Web Dashboard Developer | Arabella Jarapa |
| QA Tester / Documentation | Josiel De Rosa |

---

## System Overview

AquaGuard processes live RTSP or webcam video on an edge server using YOLOv11s for person-state detection and MediaPipe Pose for landmark-based behavior scoring. A rolling confidence filter (N=15, T=0.75, K=10) suppresses false positives before dispatching alerts. Confirmed events are sent in parallel to MQTT (ESP32 physical alarm), Flask REST + Socket.IO (dashboard), and database logging. The production target is end-to-end drowning alerting in 3 seconds or less.

## Tech Stack

| Layer | Technology |

|-------|------------|
| Detection | YOLOv11s + MediaPipe Pose |
| Backend | Python Flask + Flask-SocketIO |
| Frontend | React.js + Tailwind CSS |
| Database | SQLite (dev) -> MySQL (prod) |
| Messaging | Eclipse Mosquitto MQTT |
| Hardware | ESP32-WROOM-32 |

## Prerequisites

### Software

- Python 3.11
- Node.js 20
- Visual Studio Build Tools (C++ workload) - required for CUDA
- NVIDIA GPU driver (for CUDA inference)
- Eclipse Mosquitto MQTT broker
- Git

### Hardware

- NVIDIA GPU (RTX 2050 or equivalent)
- ESP32-WROOM-32
- IP camera or webcam (USB for development)

---

## Quick Start (Windows)

### 1. Clone and set up environment

```powershell
git clone https://github.com/Cerjho/aquaguard.git
Set-Location aquaguard
python -m venv aquaguard_env
.\aquaguard_env\Scripts\Activate.ps1
```

### 2. Install Python dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r .\backend\requirements.txt
python -m pip install -r .\detection_engine\requirements.txt
```

### 3. Install frontend dependencies

```powershell
Set-Location .\frontend
npm install
Set-Location ..
```

### 4. Configure environment variables

```powershell
Copy-Item .\.env.example .\backend\.env
@"
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
"@ | Set-Content .\frontend\.env
```

Place the model weights file manually at `detection_engine/models/aquaguard_yolov11s.pt` before running the detection engine.

### 5. Initialize the database

```powershell
Set-Location .\backend
$env:FLASK_APP = "wsgi.py"
python -m flask db upgrade
python seed.py
Set-Location ..
```

### 6. Start all services

```powershell
.\scripts\start_dev.ps1
```

### 7. Run the detection engine

```powershell
& ".\aquaguard_env\Scripts\python.exe" .\detection_engine\main.py
```

### 8. Production backend startup (Gunicorn)

```powershell
Set-Location .\backend
& "..\aquaguard_env\Scripts\gunicorn.exe" -w 1 -b 0.0.0.0:5000 wsgi:app
Set-Location ..
```

Backend Socket.IO is configured with `async_mode='threading'`, so use the default
sync/threaded Gunicorn worker command above (do not pass `-k gevent` unless you also
switch backend async mode accordingly).

---

## Dashboard Features

- **Camera focus mode:** Each camera tile supports **Focus view** to open a larger modal stream with recent zone detections and alerts for faster operator triage.
- **Secure stream access:** Camera streams are consumed using short-lived stream tokens (`POST /api/v1/cameras/{zone_id}/stream-token` then `GET /stream?token=...`), with automatic token refresh in the dashboard.
- **Connectivity health banner:** The system panel shows Socket.IO connection state (`Connected` vs `Disconnected (status polling only)`), plus detection engine, ESP32, and per-camera freshness indicators.
- **Analytics drilldown interactions:** Clicking chart points/bars in analytics applies incident triage filters (`zone_id` or date range) and navigates directly to incidents/history views.
- **Alert triage and history filters:** Alert history supports filtering by zone, status, confidence threshold, and date range to reduce response noise during active monitoring.
- **Accessibility behaviors:** Focus mode supports keyboard interaction (`Enter`/`Space` to open, `Esc` to close), initial focus management on modal controls, and descriptive `aria-label` attributes on critical controls.

## Realtime Behavior

- Dashboard listens to `alert_event`, `camera_status`, and `system_status` over Socket.IO.
- On WebSocket connect, backend immediately sends current `system_status` and `camera_status` snapshot to the connecting client session.
- If socket transport drops, dashboard keeps status visibility via authenticated polling of `GET /api/v1/system/status` with adaptive backoff.
- Detection feed updates are batched client-side to avoid UI thrash during bursty events.
- Stream tokens are refreshed before expiry to keep MJPEG views active without exposing long-lived stream URLs.

---

## Running Tests

### Backend

```powershell
Set-Location .\backend
& "..\aquaguard_env\Scripts\pytest.exe" tests/ -v --cov=. --cov-report=term-missing
Set-Location ..
```

Result: 27/27 passing.

### Detection Engine

```powershell
& ".\aquaguard_env\Scripts\pytest.exe" .\detection_engine\tests\ -v
```

Result: 36/36 passing.

### Frontend

```powershell
Set-Location .\frontend
npm test -- --watchAll=false
Set-Location ..
```

Result: 22/22 passing.

Total verified result: 85/85 tests passing.

---

## API Reference

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Setup Guide

See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)

---

## Performance

| Metric | Value |

|--------|-------|
| Mean detection latency | 2623ms |
| P95 latency | 1932ms |
| Target | <= 3000ms |
| Backend tests | 27/27 passing |
| CV engine tests | 36/36 passing |
| Frontend tests | 22/22 passing |

---

## Known Gaps from Latest Review

- **Alert history contract mismatch:** frontend history currently checks `alerted_at` and confidence aliases, while backend alert records are timestamped with `triggered_at`; confidence filtering is sourced from joined `DetectionEvent.confidence_score`.
- **WebSocket auth hardening pending:** backend `backend/sockets.py` currently accepts anonymous socket connections when no token is provided (invalid token is rejected, missing token is allowed).

---

## License

Academic project - Mabini Colleges, Inc. 2025-2026
