# AquaGuard Production Deployment Guide

This guide defines the minimum production baseline for AquaGuard.

## 1. Deployment Topology

- Reverse proxy: Nginx (TLS termination, security headers, static frontend)
- Backend app: Gunicorn + gevent worker serving Flask/Socket.IO
- Database: MySQL (managed or self-hosted)
- Message broker: Mosquitto MQTT
- Detection engine: dedicated process/node with GPU access
- Monitoring: centralized logs + health checks + alerting

## 2. Required Environment Variables

Set these before starting backend and detection engine:

- `FLASK_ENV=production`
- `SECRET_KEY=<strong-random-value>`
- `JWT_SECRET_KEY=<strong-random-value>`
- `DATABASE_URL=mysql+pymysql://user:pass@host:3306/aquaguard`
- `CORS_ALLOWED_ORIGINS=https://your-dashboard-domain`
- `AQUAGUARD_API_KEY=<min-32-char-random-key>`
- `REDIS_URL=redis://host:6379/0`
- `MQTT_BROKER_HOST=<broker-host>`
- `MQTT_BROKER_PORT=1883`
- `AQUAGUARD_API_URL=https://your-api-domain`

Frontend environment:

- `REACT_APP_API_URL=https://your-api-domain`
- `REACT_APP_WS_URL=https://your-api-domain`

## 3. Backend Startup (Production)

Do not run Werkzeug dev server in production.

Example (Linux):

```bash
cd backend
source ../aquaguard_env/bin/activate
gunicorn -k gevent -w 1 -b 0.0.0.0:5000 wsgi:app
```

Example (Windows service shell):

```powershell
Set-Location .\backend
& "..\aquaguard_env\Scripts\gunicorn.exe" -k gevent -w 1 -b 0.0.0.0:5000 wsgi:app
```

## 4. Nginx Reverse Proxy Baseline

Minimum recommendations:

- Force HTTPS redirect for all HTTP traffic
- Forward websocket upgrades for Socket.IO routes
- Set strict security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`)
- Set request body limits aligned with snapshot upload constraints
- Enable access and error logs

## 5. Database and Migrations

Run migrations before releasing each version:

```bash
cd backend
flask db upgrade
```

Backup policy (minimum):

- Nightly full backup
- Point-in-time recovery enabled when available
- Restore drill at least once per quarter

## 6. Detection Engine Deployment

- Install as package (`pip install -e ./detection_engine` for managed source deployments)
- Run one `DrowningDetector` instance per camera zone
- Ensure GPU/CUDA drivers are pinned and validated in staging before production rollout
- Keep model file out of git and deploy from artifact storage

## 7. Operational Health Checks

Monitor these continuously:

- Backend `/api/v1/system/status` freshness
- Detection engine heartbeat freshness
- ESP32 heartbeat freshness
- MQTT broker availability
- DB connectivity and query latency
- Error rate and restart count

## 8. Release Checklist

- All CI jobs green (backend, frontend, detection_engine, lint)
- Critical/high security findings remediated or explicitly accepted
- Secrets rotated for release
- Migrations executed successfully
- Rollback plan documented and tested

## 9. Rollback Strategy

If release health degrades:

- Roll back backend and frontend to previous container/image tag
- Re-run previous migration state only if schema change is incompatible
- Keep detection engine on last known-good model and code package
- Verify system status and camera streams before reopening traffic
