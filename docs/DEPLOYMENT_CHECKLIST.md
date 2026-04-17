# AquaGuard Deployment Checklist

Use this checklist for final defense preparation and first facility deployment.

## 1. 48 Hours Before Go-Live

### Environment and Secrets

- [ ] Copy `.env.example` to runtime environment files.
- [ ] Set strong values for `SECRET_KEY`, `JWT_SECRET_KEY`, and `AQUAGUARD_API_KEY`.
- [ ] Set production `DATABASE_URL` (MySQL/PostgreSQL), not SQLite.
- [ ] Set production `CORS_ALLOWED_ORIGINS` to facility dashboard host.
- [ ] Set `REDIS_URL` and `RATELIMIT_STORAGE_URI` to non-memory backends.

### Infrastructure

- [ ] Verify Docker Desktop/Engine and Docker Compose are available.
- [ ] Verify LAN access for required ports: `1883`, `3478`, `5000`, `3000`.
- [ ] Verify camera endpoints are reachable from edge host.
- [ ] Verify ESP32 devices can reach MQTT broker host and port.

### Build and Startup

- [ ] Run `docker compose config -q` with production env variables.
- [ ] Start stack with `docker compose up -d`.
- [ ] Confirm all services are healthy and stable for 30 minutes.
- [ ] Confirm backend liveness endpoint `/api/health` returns success.

## 2. 24 Hours Before Go-Live

### Validation and Rehearsal

- [ ] Run backend tests.
- [ ] Run detection engine tests.
- [ ] Run frontend unit tests and smoke E2E tests.
- [ ] Run deterministic smoke script: `python scripts/defense_smoke.py`.
- [ ] Run one full end-to-end alert rehearsal.
- [ ] Run controlled recovery drill: `python scripts/recovery_drill.py --services mosquitto backend detection_engine`.
- [ ] Save rehearsal artifacts in `docs/rehearsal_evidence/`.

Rehearsal flow:

1. Login.
2. View camera stream.
3. Trigger detection event.
4. Verify dashboard alert.
5. Verify ESP32 alarm behavior.
6. Acknowledge alert.

### Operational Readiness

- [ ] Print or share `docs/OPERATOR_RUNBOOK.md` with operators.
- [ ] Print or share `docs/INCIDENT_RESPONSE.md` with operators.
- [ ] Fill `docs/HANDOFF_TEMPLATE.md` with facility-specific values.
- [ ] Create Day 1 entry in `docs/HYPERCARE_LOG_TEMPLATE.md`.
- [ ] Record rollback tag/commit and backup location.

## 3. Go-Live Day

### Startup Sequence

- [ ] Start services using documented command sequence.
- [ ] Verify `/api/health` is healthy.
- [ ] Verify authenticated `/api/v1/system/status` reports expected subsystem state.
- [ ] Verify at least one camera feed is live.
- [ ] Verify ESP32 heartbeat freshness is within threshold.

### Early Monitoring Window (First 2 Hours)

- [ ] Check service logs every 15 minutes.
- [ ] Confirm no restart loops for backend or detection engine.
- [ ] Confirm dashboard remains connected to realtime updates.
- [ ] Confirm alert acknowledgments persist correctly.

## 4. First 7 Days (Hypercare)

- [ ] Daily health snapshot captured in `docs/HYPERCARE_LOG_TEMPLATE.md`.
- [ ] Incident log maintained with time, symptom, action, and resolution.
- [ ] Latency and alert reliability reviewed daily.
- [ ] Hotfixes, if any, are tracked as separate single-concern PRs.
