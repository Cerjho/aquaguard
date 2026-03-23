# AquaGuard — Tech Stack Lock

> This file defines the exact version of every dependency used in AquaGuard.
> The Claude agent must use these exact versions. Do not upgrade without testing.
> Last verified: March 2026 — compatible with RTX 2050 CUDA 12.1, Windows 11 / Ubuntu 22.04.
>
> **IMPORTANT:** A venv (virtual environment) named `aquaguard_env` already exists with `ultralytics`
> (and therefore PyTorch + CUDA) installed. Do NOT reinstall PyTorch or ultralytics.
> Only install the remaining packages listed in the "Install remaining packages" section below.

---

## Python Version

```python
Python 3.11.x  (3.11.8 recommended)
```text

Do not use Python 3.12+ — some MediaPipe builds are not yet stable on 3.12.

---

## Environment

**Existing venv:** `aquaguard_env`
**Already installed:** `ultralytics` (includes PyTorch, torchvision, torchaudio, opencv-python, numpy, Pillow)

Always activate before running any Python command:

```bash
.\aquaguard_env\Scripts\Activate.ps1
```text

---

## requirements.txt — Detection Engine + Backend (shared venv)

> This file is for **documentation only**. Do NOT run `pip install -r requirements.txt` from scratch.
> PyTorch and ultralytics are already installed. Only run the targeted installs below.

```txt
# ── Deep Learning / Computer Vision ──────────────────────────────────────────
# Already installed via ultralytics in aquaguard_env — DO NOT REINSTALL
# torch==2.2.2+cu121
# torchvision==0.17.2+cu121
# torchaudio==2.2.2+cu121
# ultralytics==8.3.0
# opencv-python==4.10.0.84
# numpy==1.26.4
# Pillow==12.1.1

mediapipe==0.10.14            # MediaPipe Pose landmark estimation
opencv-python==4.10.0.84      # OpenCV for frame capture and processing
numpy==1.26.4                 # Numerical operations (deque analysis, landmark math)
Pillow==12.1.1                # Image encoding for snapshot JPEG export

# ── IoT / MQTT ─────────────────────────────────────────────────────────────
paho-mqtt==2.1.0              # MQTT client for publishing alerts to Mosquitto

# ── Flask Backend ──────────────────────────────────────────────────────────
Flask==3.1.3
Flask-SocketIO==5.3.6         # WebSocket server for real-time dashboard push
Flask-JWT-Extended==4.6.0     # JWT authentication
Flask-SQLAlchemy==3.1.1       # ORM
Flask-Migrate==4.0.7          # Alembic-based DB migrations
Flask-CORS==6.0.0             # CORS for React dev server
flask-bcrypt==1.0.1           # Password hashing
python-socketio==5.14.0       # Socket.IO dependency for Flask-SocketIO
python-engineio==4.12.3       # Engine.IO dependency

# ── Database ───────────────────────────────────────────────────────────────
SQLAlchemy==2.0.35
alembic==1.13.3
PyMySQL==1.1.1                # MySQL driver for production
# SQLite is built into Python — no extra package needed for development

# ── Utilities ──────────────────────────────────────────────────────────────
python-dotenv==1.0.1          # Load .env files
requests==2.32.4              # HTTP client for internal API calls from detection engine
python-dateutil==2.9.0
uuid==1.30                    # UUID generation for event IDs

# ── Testing ────────────────────────────────────────────────────────────────
pytest==8.3.3
pytest-cov==5.0.0
pytest-mock==3.14.0
httpx==0.27.2                 # Async-compatible HTTP client for Flask testing
```text

---

## requirements-dev.txt — Development Only

```txt
-r requirements.txt
black==24.8.0                 # Code formatter
flake8==7.1.1                 # Linter
isort==5.13.2                 # Import sorter
ipykernel==6.29.5             # Jupyter kernel for benchmarking notebooks
jupyter==1.1.1                # Jupyter notebook for benchmark.py development
```text

---

## Node.js Version

```node
Node.js 20.x LTS  (20.17.0 recommended)
npm 10.x
```text

---

## package.json — React Frontend

```json
{
  "name": "aquaguard-dashboard",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.2",
    "react-scripts": "5.0.1",
    "axios": "1.7.7",
    "socket.io-client": "4.7.5",
    "recharts": "2.12.7"
  },
  "devDependencies": {
    "@testing-library/react": "16.0.0",
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/user-event": "14.5.2",
    "tailwindcss": "3.4.13",
    "postcss": "8.4.47",
    "autoprefixer": "10.4.20"
  }
}
```text

---

## Arduino Libraries — ESP32 Firmware

Install via Arduino IDE Library Manager or PlatformIO:

| Library | Version | Author |
|---|---|---|
| PubSubClient | 2.8.0 | Nick O'Leary |
| ArduinoJson | 7.1.0 | Benoit Blanchon |
| WiFi (built-in ESP32) | — | Espressif |

**Arduino IDE Board Package:**

- ESP32 by Espressif Systems: `2.0.17`
- Install via: Boards Manager → search "esp32" → install Espressif ESP32

**Board target:** `ESP32 Dev Module`

---

## MQTT Broker

| Component | Version |
|---|---|
| Eclipse Mosquitto | 2.0.18 |

**Windows install:** Download from <https://mosquitto.org/download/>
**Ubuntu install:** `sudo apt install mosquitto mosquitto-clients`

---

## Docker

| Component | Version |
|---|---|
| Docker Desktop / Engine | 27.x |
| Docker Compose | 2.29.x |
| mysql Docker image | 8.0 |
| eclipse-mosquitto Docker image | 2.0 |
| nginx Docker image | 1.27-alpine |

---

## CUDA / GPU

| Component | Version |
|---|---|
| NVIDIA Driver | ≥ 531.x (Windows) / ≥ 525.x (Linux) |
| CUDA Toolkit | 12.1 |
| cuDNN | 8.9.x |
| PyTorch CUDA build | cu121 (matches CUDA 12.1) |

Verify CUDA install:

```bash
nvidia-smi                  # Shows driver version and CUDA version
nvcc --version              # Shows CUDA compiler version
python -c "import torch; print(torch.version.cuda)"   # Should print: 12.1
```text

---

## Python Installation Command Reference

> `aquaguard_env` already exists with ultralytics installed. Only run Step 2 below.

```bash
# Step 1: SKIP — aquaguard_env with ultralytics already exists

# Step 2: Activate env and install remaining packages
.\aquaguard_env\Scripts\Activate.ps1
pip install mediapipe==0.10.14
pip install flask==3.1.3 flask-socketio==5.3.6 flask-jwt-extended==4.6.0
pip install flask-sqlalchemy==3.1.1 flask-migrate==4.0.7 flask-cors==6.0.0 flask-bcrypt==1.0.1
pip install python-socketio==5.14.0 python-engineio==4.12.3
pip install paho-mqtt==2.1.0
pip install python-dotenv==1.0.1 pymysql==1.1.1 requests==2.32.4
pip install pytest==8.3.3 pytest-cov==5.0.0 pytest-mock==3.14.0 httpx==0.27.2

# Step 3: Verify all key packages
python -c "import torch; print('CUDA:', torch.cuda.is_available())"
python -c "from ultralytics import YOLO; print('Ultralytics OK')"
python -c "import mediapipe; print('MediaPipe OK')"
python -c "import cv2; print('OpenCV:', cv2.__version__)"
python -c "import flask; print('Flask:', flask.__version__)"
python -c "import paho.mqtt; print('paho-mqtt OK')"
```text

---

## Known Compatibility Notes

- **MediaPipe 0.10.14** requires Python ≤ 3.11. On Python 3.12 use 0.10.18+ if available.
- **Flask-SocketIO 5.x** requires `python-socketio>=5.0` and `python-engineio>=4.0` — both pinned above.
- **Flask-SocketIO async_mode:** Always initialize with `async_mode='threading'` when using Flask's built-in dev server or Gunicorn threaded workers. Omitting this causes WebSocket connections to hang or fail silently:

  ```python
  socketio = SocketIO(async_mode='threading', cors_allowed_origins="*")
  ```

- **MediaPipe Pose coordinate system:** All landmark x, y, z values are **normalized to [0.0, 1.0]** relative to the input image/ROI dimensions. Never compare them against pixel thresholds. Use normalized thresholds (e.g., `0.015` not `15`) or denormalize first: `px_x = landmark.x * frame_width`.
- **torch 2.2.x + cu121** is compatible with NVIDIA driver ≥ 525. The RTX 2050 on Lenovo LOQ ships with a driver that satisfies this.
- **ultralytics 8.3.0** includes YOLOv11 support. Do not use versions below 8.1.0 for YOLOv11.
- **opencv-python** and **opencv-python-headless** conflict. Use `opencv-python` for development (enables GUI windows). Use `opencv-python-headless` in Docker containers.
- **paho-mqtt 2.x** has a breaking API change from 1.x — callback signatures are different from version 1.x. Use `CallbackAPIVersion.VERSION2` AND update all callback signatures:

  ```python
  from paho.mqtt.enums import CallbackAPIVersion
  client = mqtt.Client(CallbackAPIVersion.VERSION2)

  # on_connect: 5 args (added reason_code object, properties)
  def on_connect(client, userdata, connect_flags, reason_code, properties): ...

  # on_disconnect: 5 args (added disconnect_flags, properties)
  def on_disconnect(client, userdata, disconnect_flags, reason_code, properties): ...

  # on_message: unchanged — still 3 args
  def on_message(client, userdata, message): ...
  ```

  Using the old 3- or 4-argument signatures will raise `TypeError` at runtime with paho-mqtt 2.x.
