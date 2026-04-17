# AquaGuard Deployment Package and Handoff

This document defines the Phase 8 deployment package that a different
operator can use without developer intervention.

Prerequisite: Phase 10 validation is complete and rehearsal artifacts are
captured in `docs/rehearsal_evidence/`.

## 1. Package Contents

Provide this package as a complete handoff set:

- One-command startup script (Windows): `scripts/start_stack.ps1`
- One-command startup script (Linux/macOS): `scripts/start_stack.sh`
- Release checklist: `docs/DEPLOYMENT_CHECKLIST.md`
- Operator procedures: `docs/OPERATOR_RUNBOOK.md`
- Incident playbook: `docs/INCIDENT_RESPONSE.md`
- Troubleshooting map: `docs/TROUBLESHOOTING.md`
- Handoff form: `docs/HANDOFF_TEMPLATE.md`
- Hypercare log template: `docs/HYPERCARE_LOG_TEMPLATE.md`
- Rehearsal evidence folder: `docs/rehearsal_evidence/`

## 2. One-Command Setup Path

### Windows

1. Open PowerShell in repo root.
2. Ensure `.env` is present and production values are set.
3. Run:

```powershell
.\scripts\start_stack.ps1 -TimeoutSeconds 300
```

Optional: skip image rebuild when already built.

```powershell
.\scripts\start_stack.ps1 -NoBuild -TimeoutSeconds 300
```

### Linux/macOS

1. Open shell in repo root.
2. Ensure `.env` is present and production values are set.
3. Run:

```bash
TIMEOUT_SECONDS=300 bash scripts/start_stack.sh
```

Optional: skip image rebuild when already built.

```bash
NO_BUILD=1 TIMEOUT_SECONDS=300 bash scripts/start_stack.sh
```

## 3. Release Readiness Gate

Before go-live, all of the following must be true:

- `docs/DEPLOYMENT_CHECKLIST.md` is complete through the Go-Live Day section.
- `docs/HANDOFF_TEMPLATE.md` is filled with facility-specific values.
- Smoke and recovery artifacts exist under `docs/rehearsal_evidence/`.
- Rollback version/tag and backup location are recorded.

## 4. Troubleshooting Map

Use this map for first-response triage:

| Symptom | First Action | Primary Reference |
| --- | --- | --- |
| Dashboard has no new alerts | Restart backend + detection in order | `docs/INCIDENT_RESPONSE.md` section 1 |
| Detection engine stale/offline | Check detection logs and API key/env | `docs/INCIDENT_RESPONSE.md` section 2 |
| ESP32 heartbeat stale | Validate broker reachability and restart mosquitto | `docs/TROUBLESHOOTING.md` ESP32 section |
| Camera stream black/stale | Refresh stream token and verify live snapshots | `docs/TROUBLESHOOTING.md` camera section |
| API 5xx or DB failures | Verify DB health and backend restart | `docs/INCIDENT_RESPONSE.md` section 5 |

## 5. Rollback Steps (Operator-Safe)

1. Record incident time and current running release identifier.
2. Stop stack:

```powershell
docker compose down
```

3. Checkout last known good release tag/commit.
4. Restore database backup if required by the incident.
5. Start stack using one-command setup path from section 2.
6. Validate recovery using:

```powershell
& ".\aquaguard_env\Scripts\python.exe" .\scripts\defense_smoke.py
& ".\aquaguard_env\Scripts\python.exe" .\scripts\recovery_drill.py --services mosquitto backend
```

7. Update handoff and incident logs before resuming normal operations.

## 6. Handoff Acceptance

Handoff is accepted only if the receiving operator can:

1. Start services using one command.
2. Validate health endpoints.
3. Run smoke flow successfully.
4. Execute one controlled recovery drill.
5. Complete rollback dry-run steps from this document.
