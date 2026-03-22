# AquaGuard Troubleshooting Guide

## Detection Engine Fails To Start

Symptoms:

- `Missing AQUAGUARD_API_URL for backend internal API`
- `Missing AQUAGUARD_API_KEY for backend internal API authentication`

Actions:

1. Verify `backend/.env` exists and contains `AQUAGUARD_API_KEY`.
2. Ensure backend is running before starting `detection_engine/main.py`.
3. Confirm `AQUAGUARD_API_URL` is set (for local default, use `http://localhost:5000`).

## Camera Stream Is Black Or Stale

Symptoms:

- Dashboard camera tile remains offline.
- MJPEG endpoint returns no frames.

Actions:

1. Confirm camera is active via `GET /api/v1/cameras`.
2. Request a fresh stream token from `POST /api/v1/cameras/{zone_id}/stream-token`.
3. Check live snapshots under `backend/snapshots/live` and confirm latest files update.

## WebRTC Falls Back To MJPEG

Symptoms:

- Session status reports `fallback_active`.

Actions:

1. Validate STUN/TURN env values in `backend/.env` (`WEBRTC_STUN_URLS`, `WEBRTC_TURN_URL`).
2. Call `GET /api/v1/webrtc/ice-config` to inspect active ICE config.
3. Check backend logs for `webrtc_answer_failed` or `ice_candidate_rejected`.

## Alerts Not Showing In Dashboard

Symptoms:

- Detection engine logs events but UI feed does not update.

Actions:

1. Verify frontend `REACT_APP_WS_URL` resolves to backend origin.
2. Check browser network tab for Socket.IO connection errors.
3. Confirm backend emits are succeeding after database commits.

## Flake8 Or Test Failures In Local Runs

Actions:

1. Activate the existing environment: `./aquaguard_env/Scripts/Activate.ps1`.
2. Run backend tests from `backend/` and detection tests from repo root.
3. Re-run lint in this order:
   - `python -m flake8 backend --exclude=backend/migrations`
   - `python -m flake8 detection_engine`
   - `python -m flake8 scripts`

## CI Security Scan Warnings

Notes:

- The `security-scan` CI job is non-blocking by design.
- Address high vulnerabilities first (`npm audit --omit=dev --audit-level=high`).
- Pin upgrades in `frontend/package.json` and re-run full CI-equivalent checks locally.
