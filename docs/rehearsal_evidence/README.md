# Rehearsal Evidence Folder

Store deployment rehearsal outputs in this folder.

## Required Artifacts

- `defense_smoke_YYYY-MM-DD.log` from `scripts/defense_smoke.py`
- `recovery_drill_YYYY-MM-DD.json` from `scripts/recovery_drill.py`
- `recovery_drill_YYYY-MM-DD.log` from `scripts/recovery_drill.py`
- Optional screenshots, logs, or incident timelines for drill outcomes

## Deferred Rehearsal Handling

If rehearsal execution is deferred due to environment constraints
(for example, no active camera source), add a dated markdown note
in this folder with:

- reason for deferral
- owner
- next scheduled run date
- blocking dependency

Do not mark deployment rehearsal checklist items complete until
required artifacts are captured.
