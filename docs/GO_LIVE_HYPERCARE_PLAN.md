# AquaGuard Go-Live and Hypercare Plan

This document defines Phase 9 operations for immediate deployment after
defense using the validated package from Phase 8.

Prerequisite: `docs/DEPLOYMENT_PACKAGE.md` and
`docs/DEPLOYMENT_CHECKLIST.md` are complete.

## 1. Go-Live Trigger

Go live immediately after defense when all conditions are true:

- Rehearsal artifacts are present in `docs/rehearsal_evidence/`.
- Handoff form is completed: `docs/HANDOFF_TEMPLATE.md`.
- Rollback version and backup path are documented.
- On-call contacts are confirmed for the first 7 days.

Deployment command path:

- Windows: `.\scripts\start_stack.ps1 -TimeoutSeconds 300`
- Linux/macOS: `TIMEOUT_SECONDS=300 bash scripts/start_stack.sh`

## 2. Week 1 Monitoring Cadence

### Day 0 (Go-Live Day)

- First 2 hours: check health every 15 minutes.
- Hours 3-8: check health every 30 minutes.
- End of day: complete one hypercare log entry.

### Days 1-7

- Start of shift: run health and smoke checks.
- Mid-shift: verify status/latency/error budgets.
- End of shift: complete `docs/HYPERCARE_LOG_TEMPLATE.md` entry.

## 3. Operational Budgets

Track these budgets during hypercare:

- Health budget: `/api/health` and authenticated `/api/v1/system/status`
  succeed in at least 99% of checks per day.
- Latency budget: alert pipeline mean latency at or below 3000ms, with p95
  at or below 3500ms.
- Error budget: backend 5xx responses below 1% of total API traffic.
- Stability budget: no more than 1 unexpected restart per 24 hours for
  `backend` and `detection_engine`.
- Device freshness budget: ESP32 heartbeat remains within stale threshold
  throughout each shift.

If any budget is breached, open an incident and apply response flow from
`docs/INCIDENT_RESPONSE.md`.

## 4. Allowed Changes During Hypercare

Only hotfixes that preserve release scope are allowed.

Allowed:

- Security fixes.
- Reliability fixes for startup, health, alert flow, or data integrity.
- Config corrections for production parity.

Not allowed:

- New features.
- Broad refactors.
- Unrelated dependency upgrades.
- UI redesign changes.

Hotfix rules:

- One PR, one concern.
- Branch naming and commit conventions follow `.github/copilot-instructions.md`.
- Each hotfix includes a regression test or validation evidence.

## 5. Escalation and Rollback Triggers

Trigger immediate rollback decision if any of the following occurs:

- Two consecutive failed smoke runs.
- Sustained latency budget breach across two consecutive monitoring windows.
- Repeated unexpected backend or detection restarts in the same shift.
- Critical alert-path regression where alert generation or acknowledgment fails.

Rollback execution must follow `docs/DEPLOYMENT_PACKAGE.md` section 5.

## 6. Hypercare Exit Criteria

At the end of Day 7, declare hypercare complete only when:

- No open critical incidents remain.
- All daily logs are completed in `docs/HYPERCARE_LOG_TEMPLATE.md`.
- Budgets were met or documented with approved remediation.
- Remaining non-critical follow-ups are tracked as separate issues/PRs.
