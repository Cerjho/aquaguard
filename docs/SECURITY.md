# AquaGuard Security Guide

This document defines security controls and operational practices for AquaGuard.

## 1. Security Model

AquaGuard trust boundaries:

- Untrusted: browser clients, network transport, camera input streams
- Semi-trusted: detection engine worker nodes
- Trusted: backend API, database, secret store, CI secrets

Primary threats:

- Token theft and session abuse
- Cross-origin websocket/API abuse
- Unauthorized internal endpoint access
- Snapshot payload abuse (oversized or invalid images)
- Credential leakage and weak secret rotation

## 2. Authentication and Session Controls

- JWTs are delivered via cookies with CSRF protection enabled
- Access/refresh token revocation uses Redis-backed blocklist
- Stream access uses short-lived camera stream tokens
- Internal endpoints must validate `AQUAGUARD_API_KEY`
- Login endpoint is rate-limited

## 3. Transport Security

- Enforce HTTPS at the reverse proxy
- Restrict CORS and Socket.IO origins to trusted dashboard domains
- Never expose debug servers publicly

## 4. Secret Management

Never commit:

- `.env` files with real secrets
- API keys, DB credentials, MQTT credentials
- private model artifacts

Required secret hygiene:

- Minimum 32-character random values for critical secrets
- Separate secrets by environment (dev/staging/prod)
- Rotate secrets on schedule and after any incident

## 5. Data Validation Controls

- Validate all incoming payload shapes and required fields
- Snapshot uploads: strict base64 decode + image verification + max size checks
- Validate IDs and timestamps before DB writes

## 6. Logging and Monitoring

- Log authentication failures and rate-limit events
- Log websocket connect/disconnect trends and errors
- Track alert pipeline freshness and subsystem heartbeat drift
- Alert on repeated API key validation failures

Do not log secrets or raw credentials.

## 7. Dependency and Vulnerability Management

- Run `npm audit` for frontend dependencies
- Run `pip-audit` for Python dependencies
- Patch direct vulnerabilities first, then transitive dependencies where safe
- Track accepted risk with owner and expiration date

## 8. Incident Response Baseline

If compromise is suspected:

1. Rotate `JWT_SECRET_KEY`, `SECRET_KEY`, and `AQUAGUARD_API_KEY`
2. Revoke active sessions and restart services
3. Audit logs for unauthorized access patterns
4. Rebuild from trusted artifacts and redeploy
5. Document root cause and remediation actions

## 9. Secure Development Checklist

- Use least privilege for service accounts and DB users
- Keep tests passing after security changes
- Add regression tests for each security fix
- Require PR review before merge
- Verify production configuration against `docs/PRODUCTION_DEPLOYMENT.md`
