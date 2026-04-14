# Fix Request to Agent 2 — Backend WebRTC ICE Config Exposure

**From:** Agent 6 (DevOps)
**To:** Agent 2 (Backend)
**Priority:** High

## Why

DevOps now injects WebRTC/TURN/STUN runtime env vars via `docker-compose.yml`:

- `WEBRTC_STUN_URLS`
- `WEBRTC_TURN_URL`
- `WEBRTC_TURN_USERNAME`
- `WEBRTC_TURN_CREDENTIAL`
- `WEBRTC_ICE_TRANSPORT_POLICY`
- `WEBRTC_FORCE_RELAY`
- `WEBRTC_SESSION_TTL_SECONDS`

Backend currently accepts signaling payloads, but frontend still needs a trusted
server-sourced ICE config contract.

## Requested Backend Changes

1. Add a read-only endpoint for frontend ICE bootstrap:

   - `GET /api/v1/webrtc/ice-config`

1. Response payload (example):

```json

   {
     "iceServers": [
       {"urls": ["stun:stun.l.google.com:19302"]},
       {"urls": ["turn:localhost:3478?transport=udp"], "username": "aquaguard",
       "credential": "***"}
     ],
     "iceTransportPolicy": "all",
     "forceRelay": false,
     "sessionTtlSeconds": 300
   }

```

1. Parse comma-separated STUN URLs from `WEBRTC_STUN_URLS`.

1. If `WEBRTC_FORCE_RELAY=true`, set `iceTransportPolicy` to `relay` in
   response.

1. Ensure endpoint works with existing auth model (JWT and/or X-API-Key).

## Validation expected from Agent 2

- Add backend tests for this endpoint and env parsing.
- Update `agents/status/agent2_webrtc_contract_ready.md` with new endpoint
  details.
