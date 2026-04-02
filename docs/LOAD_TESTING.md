# AquaGuard Load Testing Guide

## Tool

Use [scripts/load_test.py](../scripts/load_test.py) for lightweight HTTP load probes.

## Quick Example

```powershell
.\aquaguard_env\Scripts\python scripts\load_test.py --url http://127.0.0.1:5000/api/v1/system/status --requests 300 --concurrency 20
```
## Multi-Round Example + JSON Output

```powershell
.\aquaguard_env\Scripts\python scripts\load_test.py --url http://127.0.0.1:5000/api/v1/system/status --requests 300 --concurrency 20 --rounds 5 --output agents/status/load_test_system_status.json
```
## Suggested Targets

- `/api/v1/system/status`
- `/api/v1/events?page=1&limit=20`
- `/api/v1/alerts?page=1&limit=20`

## Interpreting Results

- `success_rate` should remain near 100%
- `latency_ms_p95` is the key signal for user-perceived performance
- Compare per-round drift to detect degradation under sustained load

