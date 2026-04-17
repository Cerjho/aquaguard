# AquaGuard Hypercare Log Template

Use this template for the first 7 days after go-live.

## 1. Daily Snapshot Header

- Date:
- Facility:
- Shift / Time Window:
- Operator:
- Reviewer:

## 2. System Health Snapshot

| Metric | Expected | Observed | Status (OK/Warn/Fail) | Notes |
| --- | --- | --- | --- | --- |
| `/api/health` | HTTP 200 |  |  |  |
| `/api/v1/system/status` | authenticated success |  |  |  |
| Detection heartbeat age | below stale threshold |  |  |  |
| ESP32 heartbeat age | below stale threshold |  |  |  |
| Camera online count | all required cameras online |  |  |  |
| Backend restarts (24h) | 0 unexpected restarts |  |  |  |
| Detection restarts (24h) | 0 unexpected restarts |  |  |  |

## 3. Alert Reliability Snapshot

| Metric | Observed | Notes |
| --- | --- | --- |
| Alerts generated |  |
| Alerts acknowledged |  |
| Average acknowledge time |  |
| False positives observed |  |
| Missed alert reports |  |

## 4. Incident Log Summary

| Time | Symptom | Immediate Action | Resolution | Owner |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 5. Recovery Validation

| Check | Result | Notes |
| --- | --- | --- |
| Backend healthy after restart actions |  |  |
| Detection stream recovered |  |  |
| Dashboard realtime updates healthy |  |  |
| Optional recovery drill run |  |  |

## 6. Day Sign-off

- Open risks for next shift:
- Required follow-up actions:
- Operator sign-off:
- Reviewer sign-off:

---

# Day 1 Hypercare Entry (2026-04-17)

## 1. Daily Snapshot Header

- Date: 2026-04-17
- Facility: Local validation environment (pre-facility handoff)
- Shift / Time Window: Day 1 validation window
- Operator: Copilot-assisted run
- Reviewer: Pending human reviewer sign-off

## 2. System Health Snapshot

| Metric | Expected | Observed | Status (OK/Warn/Fail) | Notes |
| --- | --- | --- | --- | --- |
| `/api/health` | HTTP 200 | success (HTTP 200) | OK | Verified after backend startup |
| `/api/v1/system/status` | authenticated success | success with expected fields | OK | Fields: camera_status, detection_engine, esp32, generated_at, subsystems |
| Detection heartbeat age | below stale threshold | not fully validated in this minimal run | Warn | Detection container was not started in this bandwidth-constrained validation |
| ESP32 heartbeat age | below stale threshold | no live device heartbeat in local validation | Warn | Requires facility device run |
| Camera online count | all required cameras online | 1 active camera (`zone_dev`) | OK | Dev camera zone validated |
| Backend restarts (24h) | 0 unexpected restarts | 0 observed unexpected restarts | OK | Backend healthy after startup |
| Detection restarts (24h) | 0 unexpected restarts | not observed in this run | Warn | Pending full stack run |

## 3. Alert Reliability Snapshot

| Metric | Observed | Notes |
| --- | --- | --- |
| Alerts generated | 1 in smoke flow | Triggered by `scripts/defense_smoke.py` |
| Alerts acknowledged | 1 in smoke flow | Acknowledgment confirmed by script |
| Average acknowledge time | script-level pass (exact timing not recorded) | Add precise timing in facility run |
| False positives observed | 0 in scripted flow | Synthetic smoke event only |
| Missed alert reports | 0 in scripted flow | No misses observed |

## 4. Incident Log Summary

| Time | Symptom | Immediate Action | Resolution | Owner |
| --- | --- | --- | --- | --- |
| 2026-04-17 | Admin login failed after startup seed | Reset admin password inside backend container | Login restored, smoke flow passed | Ops run |

## 5. Recovery Validation

| Check | Result | Notes |
| --- | --- | --- |
| Backend healthy after restart actions | Pass | `/api/health` success after startup |
| Detection stream recovered | Partial | Not executed in this minimal-service Day 1 run |
| Dashboard realtime updates healthy | Partial | Frontend/detection skipped in this run |
| Optional recovery drill run | Pass (core services) | Prior run passed for `mosquitto` and `backend` |

## 6. Day Sign-off

- Open risks for next shift: Full-stack rehearsal (`frontend` + `detection_engine`) still pending in a stable/high-bandwidth window.
- Required follow-up actions: Run `scripts/start_stack.ps1 -NoBuild` to full completion and execute `scripts/recovery_drill.py --services mosquitto backend detection_engine`.
- Operator sign-off: Completed for minimal-service Day 1 validation.
- Reviewer sign-off: Pending.

## Day 1 Evidence

- `docs/rehearsal_evidence/day1_hypercare_snapshot_2026-04-17.json`
- `docs/rehearsal_evidence/defense_smoke_day1_2026-04-17.log`
- `docs/rehearsal_evidence/defense_smoke_2026-04-17.log`
- `docs/rehearsal_evidence/recovery_drill_2026-04-17.log`
- `docs/rehearsal_evidence/recovery_drill_2026-04-17.json`
