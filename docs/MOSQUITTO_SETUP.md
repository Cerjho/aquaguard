# Mosquitto Setup (Windows, AquaGuard)

This project supports two broker modes on Windows:

- Recommended: Docker Mosquitto (matches project deployment model)
- Optional: Native Mosquitto install for standalone local tests

## 1. Recommended Mode: Docker Mosquitto

From repo root:

```powershell
docker compose up -d mosquitto
```

Verify container and published port:

```powershell
docker ps --filter "name=aquaguard-mqtt" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Get-NetTCPConnection -LocalPort 1883 -State Listen
```

Expected result includes published mapping like:

- 0.0.0.0:1883->1883/tcp

## 2. Disable Native Service If Present (Important)

If native Mosquitto service is installed, disable it to prevent conflicts with
Docker binding.

Run in Administrator PowerShell:

```powershell
sc.exe stop mosquitto
sc.exe config mosquitto start= disabled
sc.exe qc mosquitto
```

Expected:

- STATE : STOPPED
- START_TYPE : DISABLED

## 3. Connectivity Check (Host LAN IP)

Replace with your active LAN IP:

```powershell
Test-NetConnection 10.126.83.130 -Port 1883
```

Expected:

- TcpTestSucceeded : True

## 4. Optional Native Mosquitto Mode

Install:

```powershell
winget install EclipseFoundation.Mosquitto
```

Run with project config:

```powershell
& "C:\Program Files\Mosquitto\mosquitto.exe" -c ".\mqtt\mosquitto.conf"
```

Use this mode only if Docker is unavailable.

## 5. Quick Pub/Sub Smoke Test

Subscriber terminal:

```powershell
& "C:\Program Files\Mosquitto\mosquitto_sub.exe" -h localhost -p 1883 -t aquaguard/alert
```

Publisher terminal:

```powershell
& "C:\Program Files\Mosquitto\mosquitto_pub.exe" -h localhost -p 1883 -t aquaguard/alert -m "{\"test\":true}"
```

If subscriber receives payload, MQTT transport is working.
