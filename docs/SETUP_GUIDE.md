# AquaGuard Setup Guide (Demo + Facility Readiness)

This guide is optimized for two outcomes:

- Fast demo setup (single operator, Windows laptop, ESP32, one or more cameras)
- Clean handoff path to target-facility deployment

Use this guide for first-time setup, onsite demos, and pre-deployment validation.

## 1. Setup Modes

### Mode A - Demo (recommended first)

Use when you need to prove end-to-end flow quickly:

- ESP32 receives MQTT alerts and publishes heartbeats
- Dashboard is live
- Detection engine is running

### Mode B - Facility Pilot / Deployment Prep

Use when preparing for the target facility:

- Stable LAN instead of phone hotspot
- Fixed addressing and firewall policy
- Service hardening and operational runbook

## 2. Prerequisites (Windows)

### Core software

- Python 3.11.x
- Node.js 20 LTS
- Git
- Docker Desktop
- Arduino IDE 2.x

### Optional local Mosquitto install

- Eclipse Mosquitto 2.x

Note: If you use Docker Mosquitto (recommended), do not rely on the Windows
Mosquitto service for production-like tests.

### Hardware

- NVIDIA GPU machine (edge host)
- ESP32-WROOM-32
- USB webcam or RTSP camera

## 3. Repository and Environment

```powershell
git clone https://github.com/Cerjho/aquaguard.git
Set-Location aquaguard

# Use existing env if already present
if (-not (Test-Path .\aquaguard_env)) {
  python -m venv aquaguard_env
}

.\aquaguard_env\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r .\backend\requirements.txt
python -m pip install -r .\detection_engine\requirements.txt
```

Frontend:

```powershell
Set-Location .\frontend
npm install
Set-Location ..
```

Model file:

- Place aquaguard_yolov11s.pt at detection_engine/models/aquaguard_yolov11s.pt

## 4. MQTT for Demo (Recommended: Docker Mosquitto)

Start broker with project config:

```powershell
docker compose up -d mosquitto
```

If Windows Mosquitto service is installed, disable it once (Admin PowerShell)
so it does not conflict with Docker binding:

```powershell
sc.exe stop mosquitto
sc.exe config mosquitto start= disabled
sc.exe query mosquitto
```

Verify listener and LAN reachability (replace host IP if different):

```powershell
Get-NetTCPConnection -LocalPort 1883 -State Listen
Test-NetConnection 10.126.83.130 -Port 1883
```

Success criteria:

- Docker shows 0.0.0.0:1883 published
- Test-NetConnection returns TcpTestSucceeded : True

## 5. Env Files and Database

Backend env:

```powershell
Copy-Item .\.env.example .\backend\.env -ErrorAction SilentlyContinue
```

Frontend env:

```powershell
@"
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
"@ | Set-Content .\frontend\.env
```

Initialize DB:

```powershell
Set-Location .\backend
$env:FLASK_APP = "wsgi.py"
python -m flask db upgrade
python seed.py
Set-Location ..
```

## 6. ESP32 Provisioning Flow (No Hardcoded Network Values)

Open in Arduino IDE:

- esp32/aquaguard_esp32/aquaguard_esp32.ino

Ensure config defaults are empty for runtime provisioning:

- WIFI_SSID=""
- WIFI_PASSWORD=""
- MQTT_BROKER=""

Upload firmware and open Serial Monitor:

- Baud: 115200
- Line ending: Newline

First boot behavior:

1. Wi-Fi serial provisioning prompt appears if no credentials are cached.
2. Enter SSID, then password.
3. Firmware connects and stores credentials in NVS.
4. MQTT broker is auto-discovered on subnet.
5. If auto-discovery fails, firmware prompts for broker IP quickly.

When prompted, enter host broker IP (example):

- 10.126.83.130

Expected healthy logs:

- [WiFi] Connected! IP address: ...
- [MQTT] Connected to broker.
- [MQTT] Subscribed to aquaguard/alert
- [Heartbeat] Published ... every 30 seconds

## 7. Start Demo Services

Recommended sequence:

### Terminal 1

```powershell
.\scripts\start_dev.ps1
```

### Terminal 2

```powershell
.\aquaguard_env\Scripts\Activate.ps1
python .\detection_engine\main.py
```

Dashboard:

- <http://localhost:3000>

## 8. Demo Validation Checklist

Use this checklist before presenting onsite:

1. MQTT broker reachable on host LAN IP:1883
2. ESP32 connected and heartbeats publishing every 30s
3. Backend reachable at /api/v1/system/status
4. Dashboard login succeeds
5. Camera feed visible
6. Test alert reaches ESP32 alarm + dashboard event

Optional MQTT smoke test from host:

```powershell
.\aquaguard_env\Scripts\Activate.ps1
python .\scripts\test_mqtt.py
```

## 9. Target Facility Deployment Prep Checklist

Network and infrastructure:

1. Use dedicated router/AP or VLAN (avoid phone hotspot for production)
2. Disable AP/client isolation so ESP32 can reach edge host
3. Reserve static IP for edge host MQTT endpoint
4. Validate inbound LAN policy for port 1883 and backend port 5000
5. Ensure reliable power (UPS preferred)

System hardening:

1. Keep Windows Mosquitto service disabled when using Docker broker
2. Keep Docker Mosquitto on restart policy unless-stopped
3. Use strong backend secrets in backend/.env
4. Document service restart runbook for operators

Commissioning acceptance (minimum):

1. ESP32 online heartbeat is stable for 30+ minutes
2. At least 10/10 alert publish tests succeed
3. Dashboard remains connected while alert tests run
4. Detection engine and backend show no crash/restart loops

## 10. Fast Troubleshooting

### ESP32 connected to Wi-Fi but MQTT not connected

- Recheck host broker IP and port 1883 reachability
- Confirm Docker broker is published to 0.0.0.0:1883
- Confirm AP isolation is disabled

### Broker reachable from host but not from ESP32

- Verify both are on same SSID/subnet
- Avoid guest SSID with client isolation
- Enter broker IP during ESP32 MQTT prompt

### Port 1883 conflicts

- Stop/disable Windows Mosquitto service (Admin PowerShell)
- Keep only Docker Mosquitto active

---

For production-specific baseline controls, continue to docs/PRODUCTION_DEPLOYMENT.md.
