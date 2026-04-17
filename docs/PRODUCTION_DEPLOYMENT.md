# AquaGuard Production Deployment Guide

This document defines a practical deployment baseline for a target facility,
from pilot commissioning through steady-state operations.

## 1. Deployment Objectives

Primary objectives:

- Reliable drowning alert dispatch within operational target windows
- Stable MQTT connectivity between edge host and ESP32 devices
- Clear operator workflow for start, stop, verify, and recover

## 2. Recommended Topology (Facility)

- Edge Host: Detection engine + backend API + dashboard hosting
- MQTT Broker: Docker Mosquitto on edge host (or dedicated broker host)
- Database: MySQL (managed or self-hosted)
- Reverse proxy: Nginx (TLS, headers, websocket forwarding)
- ESP32 devices: One per alarm zone, same LAN reachability as broker

## 3. Network Design Requirements

Minimum network requirements:

1. Dedicated LAN/VLAN for AquaGuard components
2. No AP/client isolation on the SSID/VLAN used by ESP32 devices
3. Reserved/static IP for MQTT endpoint (recommended)
4. Port allow rules within facility LAN:
   - 1883 (MQTT)
   - 5000 (API/backend)
   - 3000 or reverse-proxy port for dashboard as deployed

Do not use a phone hotspot as production transport.

## 4. Environment Variables

Backend and detection engine:

- `FLASK_ENV=production`
- `SECRET_KEY=STRONG_RANDOM_SECRET`
- `JWT_SECRET_KEY=STRONG_RANDOM_SECRET`
- `DATABASE_URL=mysql+pymysql://user:pass@host:3306/aquaguard`
- `CORS_ALLOWED_ORIGINS=https://your-dashboard-domain`
- `AQUAGUARD_API_KEY=MIN_32_CHAR_RANDOM_KEY`
- `REDIS_URL=redis://host:6379/0`
- `MQTT_BROKER_HOST=FACILITY_BROKER_HOST_OR_IP`
- `MQTT_BROKER_PORT=1883`
- `AQUAGUARD_API_URL=https://your-api-domain`

Frontend:

- `REACT_APP_API_URL=https://your-api-domain`
- `REACT_APP_WS_URL=https://your-api-domain`

## 5. MQTT Service Policy (Windows Edge Host)

Recommended policy:

- Use Docker Mosquitto from project docker-compose.yml
- Keep Windows Mosquitto service disabled to avoid port conflicts

Admin PowerShell one-time policy commands:

```powershell
sc.exe stop mosquitto
sc.exe config mosquitto start= disabled
sc.exe qc mosquitto
```

Start broker:

```powershell
docker compose up -d mosquitto
```

Verify listener and reachability:

```powershell
Get-NetTCPConnection -LocalPort 1883 -State Listen
Test-NetConnection <EDGE_HOST_IP> -Port 1883
```

## 6. Backend Startup (Production)

Do not use Werkzeug in production.

Linux example:

```bash
cd backend
source ../aquaguard_env/bin/activate
gunicorn -k gevent -w 1 -b 0.0.0.0:5000 wsgi:app
```

Windows example:

```powershell
Set-Location .\backend
& "..\aquaguard_env\Scripts\gunicorn.exe" -k gevent -w 1 -b 0.0.0.0:5000 wsgi:app
```

## 7. ESP32 Commissioning Runbook

For each ESP32 zone:

1. Flash current firmware
2. Open Serial Monitor (115200, Newline)
3. Provision Wi-Fi credentials via serial prompt
4. Confirm broker auto-discovery or enter broker IP if prompted
5. Verify successful subscriptions and 30-second heartbeats

Expected healthy logs include:

- [MQTT] Connected to broker.
- [MQTT] Subscribed to aquaguard/alert
- [Heartbeat] Published ... uptime_ms ...

## 8. Facility Commissioning Acceptance

Minimum acceptance tests before go-live:

1. 30-minute heartbeat stability test per ESP32 (no disconnect loops)
2. 10 consecutive MQTT alert publish tests succeed
3. Dashboard remains connected and event feed updates in real time
4. Detection engine process remains stable during alert burst testing
5. Backend status endpoint reports healthy throughout test window

## 9. Operations and Monitoring

Monitor continuously:

- Backend status freshness (/api/v1/system/status)
- ESP32 heartbeat freshness
- MQTT broker availability and reconnect counts
- Detection engine error rate
- DB connectivity and query latency

Operational controls:

- Keep restart runbooks documented onsite
- Keep secrets in environment files only
- Rotate keys on release cycles

## 10. Backup, Release, and Rollback

Release gate:

1. CI checks green
2. Security findings triaged
3. Migrations tested in staging
4. Rollback plan documented

Rollback baseline:

1. Revert backend/frontend image or package to last known good
2. Keep detection engine on last known good model + code
3. Validate broker, API, and heartbeat recovery before reopening operations

## 11. Handover Checklist for Target Facility

Capture and hand over:

1. Final network map (IP addresses and hostnames)
2. Operator startup/shutdown procedure
3. Incident test procedure (alert + reset)
4. Service ownership and escalation contacts
5. Last known good release tag and rollback tag

## 12. Operations Runbooks and Checklists

Use the following documents together during pre-release, go-live, and handoff:

- `docs/DEPLOYMENT_PACKAGE.md` — one-command setup, troubleshooting map, and rollback handoff package
- `docs/GO_LIVE_HYPERCARE_PLAN.md` — week-one budgets, cadence, and hotfix guardrails
- `docs/DEPLOYMENT_CHECKLIST.md` — staged pre-go-live and hypercare checklist
- `docs/OPERATOR_RUNBOOK.md` — day-to-day startup, shutdown, and backup flow
- `docs/INCIDENT_RESPONSE.md` — incident diagnosis and recovery playbook
- `docs/HANDOFF_TEMPLATE.md` — deployment handoff record template
