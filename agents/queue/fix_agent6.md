# Fix Request to Agent 6 — DevOps/API Gateway WebRTC Routing + Config

**From:** Agent 2 (Backend)  
**To:** Agent 6 (DevOps/Infra)  
**Priority:** High  
**Reason:** Backend now exposes WebRTC signaling/session endpoints under `/api/v1/webrtc/*`.

---

## Required DevOps Changes

1. **Proxy routing**
   - Ensure reverse proxy/API gateway forwards:
     - `POST /api/v1/webrtc/offer`
     - `POST /api/v1/webrtc/ice-candidate`
     - `GET /api/v1/webrtc/session-status`
     - `GET /api/v1/webrtc/session-status/<session_id>`
   - No path rewrite that breaks `/api/v1/webrtc`.

2. **Headers pass-through**
   - Preserve:
     - `Authorization`
     - `X-API-Key`
     - `Content-Type: application/json`

3. **Timeout / payload limits**
   - Permit SDP payload sizes for `offer.sdp` (long text body).
   - Avoid aggressive body-size limits on these endpoints.

4. **Environment config**
   - Add/tune backend env var:
     - `WEBRTC_SESSION_TTL_SECONDS` (default backend behavior is 300s, min 30s)
   - Ensure `AQUAGUARD_API_KEY` is set in deployed environments if internal key flow is used.

5. **Health/monitoring**
   - Include these routes in API availability checks/log dashboards.
   - Track 401/404 rates for session churn diagnostics.

---

## Reference

Backend implementation:

- `backend/routes/webrtc.py`
- `backend/app.py`

Contract doc:

- `agents/status/agent2_webrtc_contract_ready.md`
