# AquaGuard Setup Guide (Windows)

This guide walks a new developer through a full Windows setup of AquaGuard from
zero to running system.

## 1. Prerequisites

Install these tools before cloning the project.

### Core software

- Python 3.11.x: <https://www.python.org/downloads/release/python-3119/>
- Node.js 20 LTS: <https://nodejs.org/en/download>
- Git for Windows: <https://git-scm.com/download/win>
- Eclipse Mosquitto 2.x: <https://mosquitto.org/download/>
- Arduino IDE 2.x: <https://www.arduino.cc/en/software>

### GPU and build tools

- NVIDIA driver (latest stable): <https://www.nvidia.com/Download/index.aspx>
- Visual Studio Build Tools (Desktop development with C++ workload):
  <https://visualstudio.microsoft.com/visual-cpp-build-tools/>

Important: Install Visual Studio C++ Build Tools before installing torch-related
packages.

### Hardware

- NVIDIA GPU (RTX 2050 or equivalent)
- ESP32-WROOM-32
- USB webcam or IP camera (RTSP)

## 2. Repository Setup

Clone the repo and create the project virtual environment.

```powershell

git clone https://github.com/Cerjho/aquaguard.git
Set-Location aquaguard
python -m venv aquaguard_env
.\aquaguard_env\Scripts\Activate.ps1

```

Critical: Use `aquaguard_env\Scripts\python.exe` or
`.\aquaguard_env\Scripts\Activate.ps1` for all Python commands in this guide.
Use venv, not conda.

## 3. Python Environment

Install backend and detection dependencies.

```powershell

python -m pip install --upgrade pip
python -m pip install -r .\backend\requirements.txt
python -m pip install -r .\detection_engine\requirements.txt

```

Verify Python stack and CUDA:

```powershell

python .\scripts\verify_cuda.py
python -c "import torch; print(torch.cuda.is_available());
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU')"

```

Model file requirement:

- `aquaguard_yolov11s.pt` is not committed to git.
- Place it manually at `detection_engine/models/aquaguard_yolov11s.pt`.

## 4. MQTT Broker Setup (Mosquitto)

Install Mosquitto, then run broker using project config.

```powershell

& "C:\Program Files\mosquitto\mosquitto.exe" -c ".\mqtt\mosquitto.conf"

```

In another terminal, verify pub/sub works:

```powershell

& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -p 1883 -t aquaguard/alert

```

```powershell

& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -p 1883 -t
aquaguard/alert -m "{\"test\":true}"

```

If the subscriber terminal receives the payload, MQTT is ready.

## 5. Environment Variables

Create backend and frontend env files.

```powershell

Copy-Item .\.env.example .\backend\.env

```

Set frontend environment:

```powershell

@"
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
"@ | Set-Content .\frontend\.env

```

Backend `backend/.env` minimum values:

```env

SECRET_KEY=change-me-to-a-random-secret
JWT_SECRET_KEY=change-me-to-another-random-secret
DATABASE_URL=sqlite:///aquaguard.db
FLASK_ENV=development
FLASK_DEBUG=1
FLASK_APP=wsgi.py

```

## 6. Database Initialization

Run Flask migrations and seed default users.

```powershell

Set-Location .\backend
$env:FLASK_APP = "wsgi.py"
python -m flask db upgrade
python seed.py
Set-Location ..

```

If this is a clean repo and migration state is missing:

```powershell

Set-Location .\backend
$env:FLASK_APP = "wsgi.py"
python -m flask db init
python -m flask db migrate -m "initial schema"
python -m flask db upgrade
python seed.py
Set-Location ..

```

Default seeded accounts:

- admin / aquaguard2026
- lifeguard / lifeguard123

## 7. Frontend Setup

Install and run React app.

```powershell

Set-Location .\frontend
npm install
npm test -- --watchAll=false
Set-Location ..

```

The frontend consumes URLs from `frontend/src/utils/constants.js` using
`process.env.REACT_APP_API_URL` and `process.env.REACT_APP_WS_URL`.

## 8. ESP32 Firmware Setup

1. Open Arduino IDE.
1. Open `esp32/aquaguard_esp32/aquaguard_esp32.ino`.
1. Install libraries:
   - PubSubClient by Nick O'Leary
   - ArduinoJson by Benoit Blanchon
1. Open `esp32/aquaguard_esp32/config.h` and update:
   - `WIFI_SSID`
   - `WIFI_PASSWORD`
   - `MQTT_BROKER` (your machine local IPv4)
   - `MQTT_PORT`
   - `ALARM_PIN`
1. Select board: ESP32 Dev Module.
1. Select COM port and Upload.

To find your machine local IPv4 for `MQTT_BROKER`:

```powershell

ipconfig

```

Use the IPv4 address of your active Wi-Fi/Ethernet adapter.

## 9. Start All Services

Preferred method (single command):

```powershell

.\scripts\start_dev.ps1

```

Manual method (separate terminals):

Terminal 1 - MQTT:

```powershell

& "C:\Program Files\mosquitto\mosquitto.exe" -c ".\mqtt\mosquitto.conf"

```

Terminal 2 - Flask backend:

```powershell

.\aquaguard_env\Scripts\Activate.ps1
Set-Location .\backend
$env:FLASK_APP = "wsgi.py"
python -m flask run --port=5000

```

Terminal 3 - React frontend:

```powershell

Set-Location .\frontend
npm start

```

## 10. Run the Detection Engine

In a new terminal at repo root:

```powershell

.\aquaguard_env\Scripts\Activate.ps1
python .\detection_engine\main.py

```

## 11. Verify Everything Works

1. Run environment verification:

```powershell

python .\scripts\verify_cuda.py

```

1. Open dashboard in browser:

- <http://localhost:3000>

1. Login with seeded user.
1. Confirm camera list loads and WebSocket connection is established.
1. Trigger a test detection flow and verify:
   - Alert appears in dashboard
   - Event appears in API results
   - ESP32 receives MQTT alert and actuates alarm

## 12. Troubleshooting

### Issue: `torch.cuda.is_available()` is False

- Update NVIDIA driver.
- Confirm GPU is visible in `nvidia-smi`.
- Reopen terminal and reactivate venv.

### Issue: Model file not found

Error example: missing `detection_engine/models/aquaguard_yolov11s.pt`

Fix:

- Copy the trained weight file manually to `detection_engine/models/`.
- Re-run `python scripts/verify_cuda.py`.

### Issue: Mosquitto does not start

- Verify installation path `C:\Program Files\mosquitto\`.
- Check port 1883 is free:

```powershell

netstat -ano | findstr :1883

```

### Issue: Flask port already in use

```powershell

netstat -ano | findstr :5000

```

Stop conflicting process, then restart backend.

### Issue: Frontend cannot connect to API

- Confirm `frontend/.env` contains:
  - `REACT_APP_API_URL=http://localhost:5000`
  - `REACT_APP_WS_URL=http://localhost:5000`
- Restart `npm start` after editing `.env`.

### Issue: Unauthorized (401) on API endpoints

- Login again to refresh token.
- Ensure Authorization header format is `Bearer <token>`.

### Issue: ESP32 receives no MQTT alert

- Confirm `MQTT_BROKER` in `config.h` matches PC IPv4.
- Confirm ESP32 and PC are on same network.
- Test broker manually with `mosquitto_pub` and `mosquitto_sub`.

### Issue: WebSocket `connect_error`

- Check backend is running on port 5000.
- Ensure token is present in browser localStorage.
- Check backend logs for JWT decode failures.

______________________________________________________________________

You now have a complete local AquaGuard developer environment on Windows.
