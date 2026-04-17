# AquaGuard Incident Response Guide

Use this guide for common operational incidents.

## 1. No Alerts Appearing in Dashboard

Symptoms:

- Detection engine logs detections.
- Dashboard feed does not update.

Actions:

1. Check backend realtime/socket logs.
2. Verify frontend can reach API/WS URLs.
3. Verify backend health endpoint and authenticated system status.
4. Restart backend and detection engine in order.

```powershell
docker compose restart backend detection_engine
```

## 2. Detection Engine Not Healthy

Symptoms:

- Detection engine freshness increases beyond threshold.
- Camera health files stop updating.

Actions:

1. Inspect detection container logs.

```powershell
docker compose logs --tail=200 detection_engine
```

1. Verify backend API URL and API key environment values.
2. Verify model file exists and is readable.
3. Restart detection engine.

```powershell
docker compose restart detection_engine
```

## 3. ESP32 Heartbeat Stale or Offline

Symptoms:

- System status reports offline/stale ESP32 heartbeat.

Actions:

1. Verify MQTT broker is healthy and listening on LAN.
2. Verify ESP32 network path to broker.
3. If on Windows, ensure native Mosquitto service is not conflicting with Docker broker.
4. Restart broker if needed.

```powershell
docker compose restart mosquitto
```

## 4. Dashboard Loads But Camera Stream Is Black

Symptoms:

- Dashboard opens, but tiles remain black or stale.

Actions:

1. Verify camera source reachability.
2. Request fresh stream token and reload dashboard tile.
3. Confirm `backend/snapshots/live` artifacts are updating.
4. Restart detection engine if frame pipeline is stalled.

## 5. API Errors or Database Connection Failures

Symptoms:

- Backend returns frequent 5xx responses.
- Logs indicate DB connectivity or migration issues.

Actions:

1. Confirm database service is healthy.
2. Verify `DATABASE_URL` is correct.
3. Check migration status and apply pending migrations.
4. Restart backend after DB recovery.

```powershell
docker compose restart backend
```

## 6. Recovery Verification (After Any Incident)

1. `/api/health` returns success.
2. Authenticated `/api/v1/system/status` shows expected subsystem states.
3. Camera stream and alert flow both recover.
4. Incident timeline and resolution are logged.
