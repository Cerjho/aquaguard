# Agent 6 — TURN/STUN/WebRTC Infra Ready

**Status:** READY (DevOps scope)
**Date:** 2026-03-21

## Infra changes made

1. **`docker-compose.yml`**
   - Added `coturn` service using `coturn/coturn:4.6.3`
   - Exposed TURN on `3478/tcp` and `3478/udp`
   - Added backend WebRTC env wiring:
     - `WEBRTC_SESSION_TTL_SECONDS`
     - `WEBRTC_STUN_URLS`
     - `WEBRTC_TURN_URL`
     - `WEBRTC_TURN_USERNAME`
     - `WEBRTC_TURN_CREDENTIAL`
     - `WEBRTC_ICE_TRANSPORT_POLICY`
     - `WEBRTC_FORCE_RELAY`
     - `AQUAGUARD_API_KEY`
   - Added frontend WebRTC env wiring:
     - `REACT_APP_WEBRTC_STUN_URLS`
     - `REACT_APP_WEBRTC_TURN_URL`
     - `REACT_APP_WEBRTC_TURN_USERNAME`
     - `REACT_APP_WEBRTC_TURN_CREDENTIAL`
     - `REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY`
     - `REACT_APP_WEBRTC_FORCE_RELAY`
     - `REACT_APP_WEBRTC_ENABLE`
   - Updated service dependencies so `backend` and `frontend` depend on `coturn`.

2. **`scripts/start_dev.ps1`**
   - Added `-SkipTurn` toggle
   - Added optional startup of `coturn` via `docker compose up -d coturn`
   - Added graceful stop path for coturn via `docker compose stop coturn`

3. **`scripts/start_dev.sh`** (created)
   - Added Linux/macOS startup helper
   - Supports `SKIP_MQTT`, `SKIP_TURN`, `SKIP_FRONTEND` toggles
   - Starts mosquitto/coturn/backend/frontend via Docker Compose

4. **`scripts/verify_cuda.py`**
   - Extended checks to include:
     - presence of `coturn` service in compose
     - presence of `WEBRTC_STUN_URLS` + `WEBRTC_TURN_URL` in compose
     - optional TURN runtime env visibility

## Env vars / flags

### Compose/runtime env (backend)

- `WEBRTC_SESSION_TTL_SECONDS` (default `300`)
- `WEBRTC_STUN_URLS` (default `stun:stun.l.google.com:19302`)
- `WEBRTC_TURN_URL` (default `turn:localhost:3478?transport=udp`)
- `WEBRTC_TURN_USERNAME` (default `aquaguard`)
- `WEBRTC_TURN_CREDENTIAL` (default `aquaguardpass`)
- `WEBRTC_ICE_TRANSPORT_POLICY` (default `all`)
- `WEBRTC_FORCE_RELAY` (default `false`)
- `AQUAGUARD_API_KEY` (optional)

### Compose/runtime env (frontend)

- `REACT_APP_WEBRTC_STUN_URLS`
- `REACT_APP_WEBRTC_TURN_URL`
- `REACT_APP_WEBRTC_TURN_USERNAME`
- `REACT_APP_WEBRTC_TURN_CREDENTIAL`
- `REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY`
- `REACT_APP_WEBRTC_FORCE_RELAY`
- `REACT_APP_WEBRTC_ENABLE`

### Startup flags/toggles

- PowerShell: `-SkipMqtt`, `-SkipTurn`, `-SkipFrontend`
- Bash env toggles: `SKIP_MQTT=1`, `SKIP_TURN=1`, `SKIP_FRONTEND=1`

## Verification commands and results

### 1) Compose validation

```powershell
docker compose config
```
**Result:** success.

Output summary:

- Warnings: `DATABASE_URL` and `JWT_SECRET_KEY` unset (default blank), and compose `version` marked obsolete.
- Confirmed services rendered by compose: `mosquitto`, `coturn`, `backend`, `frontend`, `detection_engine`.
- Confirmed backend/frontend WebRTC env vars are present in rendered config.

### 2) Environment + infra verification

```powershell
python scripts/verify_cuda.py
```
**Result:** success.

Key output:

```
13/13 checks passed
Environment is ready.
```
Additional note from output:

- CUDA unavailable in this runtime (`PyTorch: 2.10.0+cpu`, `CUDA available: False`), but script-level infra checks all passed.

## Rollback / fallback toggles

### Rollback

- Disable TURN startup in local dev:
  - `./scripts/start_dev.ps1 -SkipTurn`
  - `SKIP_TURN=1 bash scripts/start_dev.sh`
- Disable forced relay usage via env:
  - `WEBRTC_FORCE_RELAY=false`
  - `REACT_APP_WEBRTC_FORCE_RELAY=false`
- Hard-disable WebRTC UI path (frontend fallback mode):
  - `REACT_APP_WEBRTC_ENABLE=false`

### Fallback behavior intent

- If WebRTC is disabled or negotiation fails, frontend should fall back to MJPEG stream mode.
- Coordination requests issued to Agent 2 and Agent 3 for compatibility updates.

## Coordination artifacts created

- `agents/queue/fix_agent2.md`
- `agents/queue/fix_agent3.md`

