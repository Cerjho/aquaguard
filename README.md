# AquaGuard — IoT Drowning Detection and Real-Time Alert System

AquaGuard is an AI-powered drowning detection system that uses a YOLOv11s computer vision pipeline
combined with MediaPipe pose estimation to identify drowning events from swimming pool cameras and
trigger real-time alerts through a web dashboard and physical ESP32-based alarm.

---

## Team

| Role | Member |
|---|---|
| CV / Detection Engine | Jhocer Barcela |
| Backend API | Joshua |
| Frontend Dashboard | Arabella |
| ESP32 Firmware | Dranreb |
| QA / Testing | Josiel |

---

## System Architecture

```
Camera Feeds (RTSP/Webcam)
        │
        ▼
Detection Engine (Python + YOLOv11s + MediaPipe)
        │
        ├──► MQTT Broker (Mosquitto) ──► ESP32 Physical Alarm
        │
        └──► Flask REST API + WebSocket ──► React Dashboard
```

---

## Quick Start

### Prerequisites

- Python 3.11.x
- Node.js 20.x LTS
- NVIDIA GPU with CUDA 12.1 (RTX 2050 or better)
- Eclipse Mosquitto 2.0.x
- Conda (Miniconda or Anaconda)

### 1. Activate Python environment

```bash
conda activate aquaguard_env
```

> **Note:** The `aquaguard_env` conda environment already has `ultralytics`, `PyTorch` (CUDA 12.1),
> and `opencv-python` pre-installed. Do NOT reinstall them.

### 2. Install remaining Python dependencies

```bash
pip install mediapipe==0.10.14
pip install flask==3.0.3 flask-socketio==5.3.6 flask-jwt-extended==4.6.0
pip install flask-sqlalchemy==3.1.1 flask-migrate==4.0.7 flask-cors==4.0.1 flask-bcrypt==1.0.1
pip install python-socketio==5.11.3 python-engineio==4.9.1
pip install paho-mqtt==2.1.0
pip install python-dotenv==1.0.1 pymysql==1.1.1 requests==2.32.3
pip install pytest==8.3.3 pytest-cov==5.0.0 pytest-mock==3.14.0 httpx==0.27.2
```

### 3. Configure environment variables

```bash
cp .env.example backend/.env
# Edit backend/.env with your real values
```

### 4. Install frontend dependencies

```bash
cd frontend && npm install
```

### 5. Verify CUDA

```bash
python -c "import torch; print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

---

## Running All Services Locally

```bash
# Terminal 1 — MQTT broker
mosquitto -c mqtt/mosquitto.conf

# Terminal 2 — Flask backend
cd backend
conda activate aquaguard_env
flask run --port=5000

# Terminal 3 — React dashboard
cd frontend
npm start

# Terminal 4 — Detection engine
conda activate aquaguard_env
python detection_engine/main.py
```

Open browser at http://localhost:3000.

---

## Repository Structure

See [`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md) for the complete file layout.

---

## Development Workflow

See [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) for the branching strategy and commit conventions.

Each agent works on a dedicated feature branch:

| Agent | Branch |
|---|---|
| CV Engine | `feature/agent1-cv-engine` |
| Backend API | `feature/agent2-backend-api` |
| Frontend | `feature/agent3-frontend-dashboard` |
| ESP32 Firmware | `feature/agent4-esp32-firmware` |
| Testing | `feature/agent5-testing` |

---

## Key Technical Rules

- **Never share** a `DrowningDetector` instance across cameras — one per camera zone.
- **MediaPipe coordinates** are normalized 0.0–1.0 — never use pixel thresholds.
- **Flask-SocketIO** must use `async_mode='threading'`.
- **`socketio.emit()`** must always come after `db.session.commit()`.

See [`docs/AGENT_RULES.md`](docs/AGENT_RULES.md) for the full rule set.

---

## Documentation Index

| Document | Purpose |
|---|---|
| `docs/AquaGuard_System_Design.md` | Full system design |
| `docs/IMPLEMENTATION_PLAN.md` | Build instructions for each agent |
| `docs/TASK_BREAKDOWN.md` | Granular task list per phase |
| `docs/TECH_STACK_LOCK.md` | Exact dependency versions |
| `docs/REPO_STRUCTURE.md` | Complete file tree |
| `docs/GIT_WORKFLOW.md` | Branching, commits, and PRs |
| `docs/AGENT_RULES.md` | Non-negotiable coding rules |
