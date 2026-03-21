# Fix Request to Agent 3 — Frontend TURN/STUN Bootstrap + Fallback Toggles

**From:** Agent 6 (DevOps)
**To:** Agent 3 (Frontend)
**Priority:** High

## Why

Infra now provides TURN/STUN configuration via Docker env and backend should expose ICE config endpoint. Frontend must consume this without hardcoding ICE servers.

## Required Frontend Changes

1. Fetch ICE configuration at app startup (or before negotiation):
   - `GET /api/v1/webrtc/ice-config` (preferred)
   - Fallback to env vars only if endpoint unavailable.
2. Use `iceServers` + `iceTransportPolicy` from server response when building `RTCPeerConnection`.
3. Honor these toggles:
   - `REACT_APP_WEBRTC_ENABLE`
   - `REACT_APP_WEBRTC_FORCE_RELAY`
4. Fallback logic:
   - If WebRTC disabled, or ICE fails repeatedly, use MJPEG stream endpoint.
   - Surface active transport in UI (`WebRTC` / `MJPEG fallback`).
5. Keep using signaling contract from Agent 2:
   - `/api/v1/webrtc/offer`
   - `/api/v1/webrtc/ice-candidate`
   - `/api/v1/webrtc/session-status/*`

## Infra-provided env keys now available

- `REACT_APP_WEBRTC_STUN_URLS`
- `REACT_APP_WEBRTC_TURN_URL`
- `REACT_APP_WEBRTC_TURN_USERNAME`
- `REACT_APP_WEBRTC_TURN_CREDENTIAL`
- `REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY`
- `REACT_APP_WEBRTC_FORCE_RELAY`
- `REACT_APP_WEBRTC_ENABLE`

## Validation expected from Agent 3

- Build passes (`npm run build`).
- Add/update a status artifact describing WebRTC fallback behavior in UI.
