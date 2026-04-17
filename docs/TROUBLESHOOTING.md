# AquaGuard Troubleshooting Guide

## Detection Engine Fails To Start

Symptoms:

- `Missing AQUAGUARD_API_URL for backend internal API`
- `Missing AQUAGUARD_API_KEY for backend internal API authentication`

Actions:

1. Verify `backend/.env` exists and contains `AQUAGUARD_API_KEY`.
1. Ensure backend is running before starting `detection_engine/main.py`.
1. Confirm `AQUAGUARD_API_URL` is set (for local default, use
   `http://localhost:5000`).

## Camera Stream Is Black Or Stale

Symptoms:

- Dashboard camera tile remains offline.
- MJPEG endpoint returns no frames.

Actions:

1. Confirm camera is active via `GET /api/v1/cameras`.
1. Request a fresh stream token from `POST
   /api/v1/cameras/{zone_id}/stream-token`.
1. Check live snapshots under `backend/snapshots/live` and confirm latest
   files update.

## WebRTC Falls Back To MJPEG

Symptoms:

- Session status reports `fallback_active`.

Actions:

1. Validate STUN/TURN env values in `backend/.env` (`WEBRTC_STUN_URLS`,
   `WEBRTC_TURN_URL`).
1. Call `GET /api/v1/webrtc/ice-config` to inspect active ICE config.
1. Check backend logs for `webrtc_answer_failed` or `ice_candidate_rejected`.

## ESP32 Wi-Fi Connected But MQTT Not Connected

Symptoms:

- ESP32 logs show Wi-Fi connected but repeated MQTT reconnect attempts
- `Discovery failed — no broker responded on port 1883`

Actions:

1. Verify broker listener is exposed on LAN (not only localhost):
   - `docker ps --filter "name=aquaguard-mqtt" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`
   - `Get-NetTCPConnection -LocalPort 1883 -State Listen`
1. Verify host LAN/IP reachability:
   - `Test-NetConnection <EDGE_HOST_IP> -Port 1883`
1. If native Windows Mosquitto service exists, stop/disable it (Admin shell) to
   avoid conflicts with Docker broker binding.
1. On ESP32 serial monitor (115200, Newline), enter broker IP when prompted
   after discovery failure.
1. Confirm AP/client isolation is disabled on hotspot/router SSID.

## Alerts Not Showing In Dashboard

Symptoms:

- Detection engine logs events but UI feed does not update.

Actions:

1. Verify frontend `REACT_APP_WS_URL` resolves to backend origin.
1. Check browser network tab for Socket.IO connection errors.
1. Confirm backend emits are succeeding after database commits.

## Flake8 Or Test Failures In Local Runs

Actions:

1. Activate the existing environment: `./aquaguard_env/Scripts/Activate.ps1`.
1. Run backend tests from `backend/` and detection tests from repo root.
1. Re-run lint in this order:
   - `python -m flake8 backend --exclude=backend/migrations`
   - `python -m flake8 detection_engine`
   - `python -m flake8 scripts`

## CI Security Scan Warnings

Notes:

- The `security-scan` CI job is non-blocking by design.
- Address high vulnerabilities first (`npm audit --omit=dev
  --audit-level=high`).
- Pin upgrades in `frontend/package.json` and re-run full CI-equivalent checks
  locally.

## Related Operations Documents

For structured deployment and operations response, use:

1. `docs/DEPLOYMENT_CHECKLIST.md`
2. `docs/OPERATOR_RUNBOOK.md`
3. `docs/INCIDENT_RESPONSE.md`
4. `docs/HANDOFF_TEMPLATE.md`
