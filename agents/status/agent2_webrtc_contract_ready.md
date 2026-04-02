# Agent 2 — WebRTC Contract Ready

**Status:** READY  
**Scope:** Backend signaling/session/fallback compatibility implemented in `backend/`  
**Date:** 2026-03-21

---

## 1) Endpoint Contract

Base path: `/api/v1/webrtc`

### A. `POST /api/v1/webrtc/offer`

Registers/updates a WebRTC session offer and creates a session record.

**Required JSON fields**

- `zone_id` (string)
- `type` (must be `"offer"`)
- `sdp` (string)

**Optional JSON fields**

- `session_id` (string UUID-like; if omitted backend generates one)
- `client_id` (string)
- `fallback_transport` (string, default `"mjpeg"`)

**Success response:** `202 Accepted`

---

### B. `POST /api/v1/webrtc/ice-candidate`

Accepts ICE candidates for an existing or pre-created session.

**Required JSON fields**

- `session_id` (string)
- `candidate` (string/object; accepted as provided)

**Optional JSON fields**

- `zone_id`
- `client_id`
- `sdpMid`
- `sdpMLineIndex`
- `fallback_transport`

**Success response:** `202 Accepted`

---

### C. `GET /api/v1/webrtc/session-status/<session_id>`

and

### D. `GET /api/v1/webrtc/session-status?session_id=<id>`

Returns normalized session status plus fallback compatibility metadata.

**Optional query param**

- `force_fallback=true|1|yes` → marks session as `fallback_active`

**Success response:** `200 OK`

---

## 2) Auth + Validation Behavior

All WebRTC endpoints require one of:

- **JWT bearer token** in `Authorization: Bearer <token>`, or
- **Internal API key** in `X-API-Key` matching backend `AQUAGUARD_API_KEY`

If neither valid auth path is present → `401 {"error":"Unauthorized"}`

Validation:

- `/offer`:
  - missing `zone_id` → 400
  - missing `sdp` → 400
  - `type != "offer"` → 400
- `/ice-candidate`:
  - missing `session_id` → 400
  - missing `candidate` → 400
- `/session-status`:
  - missing `session_id` (query form) → 400
  - unknown/expired session → 404

Session handling:

- in-memory session store with lock (`_SESSIONS`, `_SESSION_LOCK`)
- TTL cleanup on each request
- TTL configurable via `WEBRTC_SESSION_TTL_SECONDS` (fallback to `SESSION_TTL_SECONDS`, default `300`, min `30`)

Fallback compatibility:

- each session tracks:
  - `fallback.transport` (default `mjpeg`)
  - `fallback.active` (bool)
  - `fallback.reason`
- status response includes `compat` object:
  - `sessionStatus` (alias of `status`)
  - `fallbackMode`
  - `retry_after_ms`

---

## 3) Sample Request / Response JSON

### `POST /api/v1/webrtc/offer` request

```json
{
  "zone_id": "zone_01",
  "client_id": "dashboard-1",
  "type": "offer",
  "sdp": "v=0\r\no=- 46117357 2 IN IP4 127.0.0.1",
  "fallback_transport": "mjpeg"
}
```
### `POST /api/v1/webrtc/offer` response (202)

```json
{
  "session_id": "9ea0fca4-4df6-4ecf-8914-0bdb5de7132f",
  "status": "offer_received",
  "accepted": true,
  "auth_type": "jwt",
  "next": {
    "ice_candidate_url": "/api/v1/webrtc/ice-candidate",
    "session_status_url": "/api/v1/webrtc/session-status/9ea0fca4-4df6-4ecf-8914-0bdb5de7132f"
  },
  "fallback": {
    "transport": "mjpeg",
    "active": false
  }
}
```
### `POST /api/v1/webrtc/ice-candidate` request

```json
{
  "session_id": "9ea0fca4-4df6-4ecf-8914-0bdb5de7132f",
  "candidate": "candidate:0 1 UDP 2122252543 192.168.1.2 54400 typ host",
  "sdpMid": "0",
  "sdpMLineIndex": 0
}
```
### `POST /api/v1/webrtc/ice-candidate` response (202)

```json
{
  "session_id": "9ea0fca4-4df6-4ecf-8914-0bdb5de7132f",
  "status": "collecting_candidates",
  "accepted": true,
  "auth_type": "jwt",
  "candidate_count": 1,
  "next": {
    "session_status_url": "/api/v1/webrtc/session-status/9ea0fca4-4df6-4ecf-8914-0bdb5de7132f"
  }
}
```
### `GET /api/v1/webrtc/session-status/<session_id>` response (200)

```json
{
  "session_id": "9ea0fca4-4df6-4ecf-8914-0bdb5de7132f",
  "zone_id": "zone_01",
  "client_id": "dashboard-1",
  "status": "collecting_candidates",
  "state": "collecting_candidates",
  "created_at": "2026-03-21T04:10:00.000000+00:00",
  "updated_at": "2026-03-21T04:10:05.000000+00:00",
  "expires_at": "2026-03-21T04:15:05.000000+00:00",
  "webrtc": {
    "offer_received": true,
    "offer_type": "offer",
    "candidate_count": 1
  },
  "fallback": {
    "transport": "mjpeg",
    "active": false,
    "reason": null
  },
  "auth_type": "jwt",
  "compat": {
    "sessionStatus": "collecting_candidates",
    "fallbackMode": "mjpeg",
    "retry_after_ms": 1500
  }
}
```
---

## 4) Files Changed and Checks Run

### Files changed (backend)

- `backend/app.py` — registered WebRTC blueprint
- `backend/routes/webrtc.py` — new signaling/session/fallback endpoints
- `backend/tests/test_webrtc.py` — backend contract tests

### Artifact/coordination files

- `agents/status/agent2_webrtc_contract_ready.md` (this file)
- `agents/queue/fix_agent3.md`
- `agents/queue/fix_agent6.md`

### Checks run

- `python -m pytest backend/tests/test_webrtc.py -v` → **4 passed**
- `python -m pytest backend/tests -v` → **59 passed**

