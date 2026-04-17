# Rehearsal Status Note (2026-04-17)

- Owner: deployment prep session

## Previous Deferral

- Original reason: no active camera zone was available in the local environment.

## Current Status (Updated)

- `scripts/defense_smoke.py` now passes with zone `zone_dev`.
- `scripts/recovery_drill.py` now passes for services `mosquitto` and `backend`.

## Evidence Artifacts

- `docs/rehearsal_evidence/defense_smoke_2026-04-17.log`
- `docs/rehearsal_evidence/recovery_drill_2026-04-17.log`
- `docs/rehearsal_evidence/recovery_drill_2026-04-17.json`

## Remaining Partial Defer

- Detection engine restart was not included in this run.
- During full-stack bring-up, container build flow hit network instability (`npm ci`
	ECONNRESET), so frontend/detection full compose rehearsal remains a follow-up.

## Next Planned Action

- Re-run `scripts/recovery_drill.py --services mosquitto backend detection_engine`
	once full stack images are built and healthy on the target network.
