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
