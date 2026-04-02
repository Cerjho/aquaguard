# AquaGuard Threat Model

## Assets

- Authentication/session tokens and refresh cookies
- Internal API key (`AQUAGUARD_API_KEY`)
- Camera stream access tokens
- Snapshot artifacts and incident metadata
- Backend database records and user identities

## Trust Boundaries

- Browser clients crossing into backend API/WebSocket
- Detection engine crossing into backend internal endpoints
- MQTT broker crossing into ESP32 device network
- CI/deployment secret management crossing into runtime

## Primary Threats (STRIDE)

### Spoofing

- Forged stream-token requests
- Forged detection-engine internal requests

Mitigations:

- JWT + CSRF protection for user routes
- Internal API key validation
- Short-lived camera stream tokens

### Tampering

- Modified alert payloads or snapshots in transit
- Configuration/secret file tampering

Mitigations:

- TLS termination in production
- Strict payload validation + snapshot verification
- Read-only secret mounts where possible

### Repudiation

- No audit evidence for acknowledge/alert actions

Mitigations:

- Structured logs (JSON mode)
- Alert/event timestamps and actor IDs persisted in DB

### Information Disclosure

- Secret leakage via logs or repo files
- Snapshot URL misuse and token replay

Mitigations:

- Never log secrets
- Secret `_FILE` support for mounted secrets
- Stream tokens scoped by zone + expiry

### Denial of Service

- Alert spam via repeated payload submissions
- API/login brute force and websocket churn

Mitigations:

- Rate-limiting on auth endpoints
- Confidence filter debounce for alert generation
- Backoff and reconnect controls for camera ingestion

### Elevation of Privilege

- Lifeguard/admin role bypass
- Internal endpoint abuse from untrusted sources

Mitigations:

- Role checks in protected routes
- Dedicated internal API key checks
- Production origin restrictions for API/WebSocket

## Residual Risks

- React test warnings around async state updates indicate potential future
  brittle behavior
- Stream-token lifecycle race windows can still surface under extreme latency
  conditions
- CI currently does not lint scripts folder by default

## Next Mitigations

1. Add script lint stage in CI with targeted allowlist
1. Add fault-injection integration tests for camera/network failures
1. Add centralized security event dashboarding for repeated auth/API-key
   failures
