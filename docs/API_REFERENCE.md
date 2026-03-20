# AquaGuard API Reference

Base URL: `http://localhost:5000/api/v1`

## Authentication

Most dashboard endpoints require JWT access tokens in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

Token endpoints:

- `POST /auth/login` returns `access_token` and `refresh_token`
- `POST /auth/refresh` requires a refresh token
- `POST /auth/logout` is stateless (client deletes tokens)

---

## Endpoints

### POST /auth/login

- Auth required: No
- Role required: None

Request body schema:

```json
{
  "username": "string",
  "password": "string"
}
```

Example request:

```json
{
  "username": "admin",
  "password": "adminpass"
}
```

Responses:

- `200 OK`

```json
{
  "access_token": "<jwt-access-token>",
  "refresh_token": "<jwt-refresh-token>",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "created_at": "2026-03-17T06:40:12.881125",
    "is_active": true
  }
}
```

- `400 Bad Request`

```json
{
  "error": "username and password required"
}
```

- `401 Unauthorized`

```json
{
  "error": "Invalid credentials"
}
```

Notes:

- Username is trimmed before lookup.
- Only active users can authenticate.

---

### POST /auth/refresh

- Auth required: Yes (refresh JWT)
- Role required: Any authenticated role

Request body:

- None

Example request header:

```http
Authorization: Bearer <refresh_token>
```

Responses:

- `200 OK`

```json
{
  "access_token": "<new-jwt-access-token>"
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `404 Not Found`

```json
{
  "error": "User not found"
}
```

Notes:

- Endpoint uses `@jwt_required(refresh=True)`.
- Expired/invalid token responses may be emitted by Flask-JWT-Extended default handlers.

---

### POST /auth/logout

- Auth required: No
- Role required: None

Request body:

- None

Responses:

- `200 OK`

```json
{
  "message": "Logged out successfully"
}
```

Notes:

- Logout is stateless in current implementation.
- Client is responsible for clearing local tokens.

---

### GET /cameras

- Auth required: Yes
- Role required: Any authenticated role

Request body:

- None

Responses:

- `200 OK`

```json
[
  {
    "id": 1,
    "zone_id": "zone_01",
    "zone_name": "Main Pool - East",
    "rtsp_url": "rtsp://192.168.1.10/stream1",
    "location_description": "East side",
    "frame_rate": 30,
    "resolution": "1280x720",
    "is_active": true,
    "created_at": "2026-03-17T06:40:12.881125"
  }
]
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

Notes:

- Returns only active cameras (`is_active = true`).

---

### POST /cameras

- Auth required: Yes
- Role required: Admin

Request body schema:

```json
{
  "zone_id": "string",
  "zone_name": "string",
  "rtsp_url": "string",
  "location_description": "string (optional)",
  "frame_rate": "integer (optional, default 30)",
  "resolution": "string (optional, default 1280x720)"
}
```

Example request:

```json
{
  "zone_id": "zone_test",
  "zone_name": "Test Zone",
  "rtsp_url": "rtsp://localhost/test",
  "location_description": "Development camera",
  "frame_rate": 30,
  "resolution": "1280x720"
}
```

Responses:

- `201 Created`

```json
{
  "id": 2,
  "zone_id": "zone_test",
  "zone_name": "Test Zone",
  "rtsp_url": "rtsp://localhost/test",
  "location_description": "Development camera",
  "frame_rate": 30,
  "resolution": "1280x720",
  "is_active": true,
  "created_at": "2026-03-17T10:18:54.162207"
}
```

- `400 Bad Request`

```json
{
  "error": "Missing fields: ['zone_id', 'zone_name', 'rtsp_url']"
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `403 Forbidden`

```json
{
  "error": "Insufficient permissions"
}
```

- `409 Conflict`

```json
{
  "error": "zone_id already exists"
}
```

Notes:

- Role enforcement uses JWT claim `role=admin`.

---

### PUT /cameras/{zone_id}

- Auth required: Yes
- Role required: Admin

Request body schema:

```json
{
  "zone_name": "string (optional)",
  "rtsp_url": "string (optional)",
  "location_description": "string (optional)",
  "frame_rate": "integer (optional)",
  "resolution": "string (optional)"
}
```

Example request:

```json
{
  "zone_name": "Main Pool - East Updated"
}
```

Responses:

- `200 OK`

```json
{
  "id": 1,
  "zone_id": "zone_01",
  "zone_name": "Main Pool - East Updated",
  "rtsp_url": "rtsp://192.168.1.10/stream1",
  "location_description": "East side",
  "frame_rate": 30,
  "resolution": "1280x720",
  "is_active": true,
  "created_at": "2026-03-17T06:40:12.881125"
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `403 Forbidden`

```json
{
  "error": "Insufficient permissions"
}
```

- `404 Not Found`

```json
{
  "error": "Camera zone not found"
}
```

Notes:

- Implementation uses `first_or_404()` for lookup.

---

### DELETE /cameras/{zone_id}

- Auth required: Yes
- Role required: Admin

Request body:

- None

Responses:

- `200 OK`

```json
{
  "message": "Camera zone_01 deactivated"
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `403 Forbidden`

```json
{
  "error": "Insufficient permissions"
}
```

- `404 Not Found`

```json
{
  "error": "Camera zone not found"
}
```

Notes:

- Camera is soft-deleted (`is_active=false`), not physically removed.

---

### GET /cameras/{zone_id}/stream

- Auth required: No JWT header required
- Role required: Stream token holder

Request body:

- None

Responses:

- `401 Unauthorized`

```json
{
  "error": "stream token is required"
}
```

- `401 Unauthorized`

```json
{
  "error": "Stream token expired"
}
```

- `200 OK` (`multipart/x-mixed-replace; boundary=frame`)

Example response chunk:

```text
--frame
Content-Type: image/jpeg

<binary-jpeg-bytes>
```

- `404 Not Found`

```json
{
  "error": "Camera zone not found"
}
```

Notes:

- Streams MJPEG frames generated from latest zone snapshot (`backend/snapshots/live/{zone_id}_latest.jpg`).
- Requires short-lived query token: `GET /api/v1/cameras/{zone_id}/stream?token=<stream_token>`.
- Recommended flow:
  1. `POST /api/v1/cameras/{zone_id}/stream-token` with JWT
  2. Consume stream with returned token until expiry
  3. Refresh token before expiry

---

### POST /cameras/{zone_id}/stream-token

- Auth required: Yes
- Role required: Any authenticated role

Request body:

- None

Responses:

- `200 OK`

```json
{
  "zone_id": "zone_01",
  "stream_token": "<signed-token>",
  "ttl_seconds": 30,
  "expires_at": "2026-03-20T10:42:33.512000+00:00",
  "expires_in_seconds": 30
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `404 Not Found`

```json
{
  "error": "Camera zone not found"
}
```

Notes:

- Token is zone-scoped and time-limited (`STREAM_TOKEN_TTL_SECONDS`, default 30s).
- Stream endpoint validates token signature, age, and zone match.

---

### POST /events

- Auth required: No (internal detection-engine endpoint)
- Role required: None

Request body schema:

```json
{
  "zone_id": "string",
  "track_id": "integer",
  "confidence_score": "number",
  "behavior_flags": "object",
  "alert_triggered": "boolean",
  "detected_at": "ISO-8601 datetime string",
  "snapshot_base64": "string (optional)"
}
```

Example request:

```json
{
  "zone_id": "zone_01",
  "track_id": 99,
  "confidence_score": 0.9,
  "behavior_flags": {
    "vertical": true,
    "arms_elevated": true
  },
  "alert_triggered": true,
  "detected_at": "2026-03-17T10:42:33.512000",
  "snapshot_base64": "<base64-jpeg>"
}
```

Responses:

- `201 Created`

```json
{
  "id": 12,
  "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
  "zone_id": "zone_01",
  "track_id": 99,
  "confidence_score": 0.9,
  "behavior_flags": {
    "vertical": true,
    "arms_elevated": true
  },
  "alert_triggered": true,
  "snapshot_path": "C:/.../backend/snapshots/6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f.jpg",
  "detected_at": "2026-03-17T10:42:33.512000",
  "alert": {
    "id": 7,
    "alert_id": "d045af42-6f2d-4fef-a4d0-315bb3e5581a",
    "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
    "zone_id": "zone_01",
    "status": "unacknowledged",
    "triggered_at": "2026-03-17T10:42:33.790414",
    "acknowledged_by": null,
    "acknowledged_at": null,
    "notes": null
  }
}
```

- `400 Bad Request`

```json
{
  "error": "Missing fields: ['zone_id']"
}
```

- `500 Internal Server Error`

```json
{
  "error": "Database error"
}
```

Notes:

- If `alert_triggered=true`, backend inserts alert then emits `alert_event` over Socket.IO after commit.

---

### GET /events

- Auth required: Yes
- Role required: Any authenticated role

Query params:

- `zone_id` (string, optional)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `alert_triggered` (`true` or `false`, optional)
- `page` (integer, default 1)
- `limit` (integer, default 20, max 100)

Responses:

- `200 OK`

```json
{
  "total": 48,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "id": 12,
      "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
      "zone_id": "zone_01",
      "track_id": 99,
      "confidence_score": 0.9,
      "behavior_flags": {
        "vertical": true
      },
      "alert_triggered": true,
      "snapshot_path": "C:/.../backend/snapshots/6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f.jpg",
      "detected_at": "2026-03-17T10:42:33.512000"
    }
  ]
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

Notes:

- Invalid datetime query values are ignored (non-fatal).

---

### GET /alerts

- Auth required: Yes
- Role required: Any authenticated role

Query params:

- `status` (optional, example `unacknowledged`)
- `zone_id` (optional)
- `from` (optional ISO datetime)
- `to` (optional ISO datetime)
- `min_confidence` (optional float, joined against `DetectionEvent.confidence_score`)
- `max_confidence` (optional float, joined against `DetectionEvent.confidence_score`)

Responses:

- `200 OK`

```json
[
  {
    "id": 7,
    "alert_id": "d045af42-6f2d-4fef-a4d0-315bb3e5581a",
    "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
    "zone_id": "zone_01",
    "status": "unacknowledged",
    "triggered_at": "2026-03-17T10:42:33.790414",
    "acknowledged_by": null,
    "acknowledged_at": null,
    "notes": null
  }
]
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

Notes:

- Results are ordered by newest `triggered_at` first.
- Confidence/date triage filters are supported for history workflows.

---

### POST /alerts/{alert_id}/acknowledge

- Auth required: Yes
- Role required: Any authenticated role

Request body schema:

```json
{
  "notes": "string (optional)"
}
```

Example request:

```json
{
  "notes": "handled"
}
```

Responses:

- `200 OK`

```json
{
  "id": 7,
  "alert_id": "d045af42-6f2d-4fef-a4d0-315bb3e5581a",
  "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
  "zone_id": "zone_01",
  "status": "acknowledged",
  "triggered_at": "2026-03-17T10:42:33.790414",
  "acknowledged_by": 1,
  "acknowledged_at": "2026-03-17T10:43:02.121745",
  "notes": "handled"
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

- `404 Not Found`

```json
{
  "error": "Alert not found"
}
```

- `409 Conflict`

```json
{
  "error": "Alert already acknowledged"
}
```

Notes:

- `acknowledged_by` is derived from JWT identity (`sub`).

---

### GET /reports/summary

- Auth required: Yes
- Role required: Any authenticated role

Query params:

- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `group_by` (reserved, currently not applied in route logic)

Responses:

- `200 OK`

```json
{
  "total_detections": 74,
  "confirmed_alerts": 6,
  "false_positives_suppressed": 68,
  "by_zone": [
    {
      "zone_id": "zone_01",
      "zone_name": "Main Pool - East",
      "detections": 40,
      "alerts": 4
    },
    {
      "zone_id": "zone_02",
      "zone_name": "Kiddie Pool",
      "detections": 34,
      "alerts": 2
    }
  ]
}
```

- `401 Unauthorized`

```json
{
  "msg": "Missing Authorization Header"
}
```

Notes:

- Invalid date values are ignored and do not produce 400.

---

## WebSocket Events

Connection:

```javascript
io(WS_URL, { auth: { token: <access_token> } })
```

### Server -> Client Events

- `alert_event`
  - Emitted after alert record commit in `POST /events` when `alert_triggered=true`.
  - Payload shape: `Alert.to_dict()`

```json
{
  "id": 7,
  "alert_id": "d045af42-6f2d-4fef-a4d0-315bb3e5581a",
  "event_id": "6d4d4724-69b4-4a78-ad8f-5fe2e8eeeb5f",
  "zone_id": "zone_01",
  "status": "unacknowledged",
  "triggered_at": "2026-03-17T10:42:33.790414",
  "acknowledged_by": null,
  "acknowledged_at": null,
  "notes": null
}
```

- `camera_status`
  - Status payload for camera connectivity.

```json
{
  "zone_id": "zone_01",
  "status": "online"
}
```

- `system_status`
  - Status payload for subsystem health.

```json
{
  "component": "detection_engine",
  "status": "degraded",
  "message": "MQTT reconnecting"
}
```

Notes:

- WebSocket `connect` handler accepts optional JWT token in handshake auth.
- Invalid token causes connection rejection.
- Current implementation emits `system_status` + `camera_status` immediately to newly connected clients.
- Frontend consumes `system_status` for detection engine/ESP32 health and falls back to polling `GET /api/v1/system/status` when socket is disconnected.

---

## Known Gaps from Latest Review

- **Alert history contract mismatch:** some frontend history views still read `alerted_at`/generic confidence aliases, while backend alert payloads expose `triggered_at` and confidence is sourced from `DetectionEvent.confidence_score`.
- **WebSocket anonymous connect:** `backend/sockets.py` currently permits connect without token; only invalid provided tokens are rejected.

---

## Error Responses

Common patterns used by the API:

- Validation error (`400`)

```json
{
  "error": "Missing fields: ['zone_id']"
}
```

- Auth error (`401`)

```json
{
  "msg": "Missing Authorization Header"
}
```

- Permission error (`403`)

```json
{
  "error": "Insufficient permissions"
}
```

- Conflict (`409`)

```json
{
  "error": "Alert already acknowledged"
}
```

- Server/DB failure (`500`)

```json
{
  "error": "Database error"
}
```
