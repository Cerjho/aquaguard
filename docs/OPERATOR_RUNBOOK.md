# AquaGuard Operator Runbook

This runbook is for on-site operators and support staff.

## 1. Daily Startup Procedure (Windows)

1. Open PowerShell in project root.
1. Start core services.

```powershell
docker compose up -d mysql redis mosquitto coturn backend frontend
```

1. Start detection engine if not included in your startup profile.

```powershell
docker compose up -d detection_engine
```

1. Verify backend liveness.

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/health
```

1. Open dashboard at `http://localhost:3000`.

## 2. Daily Health Checks

1. Backend health endpoint returns success.
2. Authenticated system status shows detection engine freshness and camera counts.
3. ESP32 heartbeat age remains below stale threshold.
4. No repeated crash/restart logs in backend or detection engine.

## 3. Shift Handover Checks

1. Confirm active cameras and offline reasons.
2. Confirm open/unacknowledged alerts count.
3. Confirm last successful heartbeat timestamp from ESP32 devices.
4. Note any incident and recovery actions in operations log.

## 4. Controlled Shutdown

1. Stop detection engine first.

```powershell
docker compose stop detection_engine
```

1. Stop dashboard and backend services.

```powershell
docker compose stop frontend backend
```

1. Stop support services if required.

```powershell
docker compose stop coturn mosquitto redis mysql
```

## 5. Backup Procedure

1. Export database backup according to your DB engine policy.
2. Backup model file from `detection_engine/models/`.
3. Backup snapshots if required by policy.
4. Store backup artifacts in facility-approved location.

## 6. Rollback Procedure

1. Checkout known good release tag/commit.
2. Re-run startup sequence.
3. Restore database backup if schema/data mismatch exists.
4. Re-verify end-to-end alert flow before resuming operations.

## 7. Escalation

1. Detection/CV issue: detection maintainer.
2. Backend/API issue: backend maintainer.
3. Dashboard issue: frontend maintainer.
4. MQTT/ESP32 issue: IoT/firmware maintainer.
