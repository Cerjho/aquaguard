# AquaGuard — VS Code + GitHub Copilot (Solo, Local Claude Agent)

> One person (Jhocer) running all agents sequentially on one machine.
> Premium requests are limited — agents run one at a time in order.

---

## Your Setup

- Machine: Lenovo LOQ 15IAX9E — RTX 2050, 8GB DDR5
- Environment: aquaguard_env (ultralytics already installed)
- Editor: VS Code with GitHub Copilot (Claude agent available)
- Constraint: ~90% of monthly premium requests already used

---

## Strategy — Sequential, One Agent at a Time

You cannot run agents in parallel (one account, limited requests).
Run them in this exact order — each phase depends on the previous.

```
Week 1:  Orchestrator → Agent 1 (CV) → Agent 4 (ESP32)
Week 2:  Agent 2 (Backend)
Week 3:  Agent 3 (Frontend)
Week 4:  Agent 5 (Testing) + Integration
```

Or faster if your request limit resets mid-build:
check github.com/settings/copilot for your reset date.

---

## One-Time Setup

### Open AquaGuard in VS Code

```bash
cd AquaGuard
conda activate aquaguard_env
code .
```

### Reload VS Code to detect agent files

`Ctrl+Shift+P` → `Developer: Reload Window`

### Verify agents appear

Open Copilot Chat (`Ctrl+Alt+I`) → click agents dropdown.
All AquaGuard agents should appear in the list.

### Verify CUDA before starting Agent 1

```bash
python -c "import torch; print(torch.cuda.is_available())"
# Must print: True
```

---

## How to Run Each Agent

### Every time you start an agent session:

1. Open terminal → `conda activate aquaguard_env`
2. Open Copilot Chat (`Ctrl+Alt+I`)
3. Click `+` for a new conversation
4. Click agents dropdown → select **Claude** model
5. Click agents dropdown again → select your target agent
6. Send the starting prompt

---

## Agent Run Order and Starting Prompts

### Session 1 — Orchestrator (Jarvy's role, but you do it)
**Agent:** AquaGuard Orchestrator
**Starting prompt:**
```
Initialize the AquaGuard GitHub repository.
Follow your startup sequence — create .github/workflows/ci.yml,
develop branch, branch protection, and agents/status/ directory.
Commit everything to GitHub.
```
**Done when:** `.github/workflows/ci.yml` exists and is pushed to GitHub.
**Estimated requests:** ~10

---

### Session 2 — Agent 4 ESP32 (quickest, do this while you have requests)
**Agent:** AquaGuard ESP32 Engineer
**Starting prompt:**
```
Begin Phase 4. Build config.h, the firmware sketch, and
scripts/test_mqtt.py in order. Follow TASK_BREAKDOWN.md tasks
P4-01 and P4-02.
```
**Done when:** `agents/status/agent4_done.md` exists and PR is open.
**Estimated requests:** ~10

---

### Session 3 — Agent 1 CV Engine (longest phase — save a fresh day)
**Agent:** AquaGuard CV Engineer
**Starting prompt:**
```
Begin Phase 2. Read all required docs first, then build every
file in the exact order listed in TASK_BREAKDOWN.md tasks
P1-03 through P2-11. Verify each file before moving to the next.
Run pytest detection_engine/tests/ -v when all files are done.
```
**Done when:** `agents/status/agent1_done.md` exists and PR is open.
**Estimated requests:** ~40
**Note:** If you run out of requests mid-session, just send
"Continue from where you left off" next day when limit resets.

---

### Session 4 — Agent 2 Backend
**Agent:** AquaGuard Backend Engineer
**Prerequisite:** agent1_done.md must exist (check Explorer panel)
**Starting prompt:**
```
Begin Phase 3. Read all required docs first, then build every
file in order from TASK_BREAKDOWN.md tasks P3-01 through P3-10.
Create conftest.py before any test file.
Run pytest backend/tests/ -v --cov=. when all files are done.
```
**Done when:** `agents/status/agent2_done.md` exists and PR is open.
**Estimated requests:** ~40

---

### Session 5 — Agent 3 Frontend
**Agent:** AquaGuard Frontend Engineer
**Prerequisite:** agent2_done.md must exist
**Starting prompt:**
```
Check that agents/status/agent2_done.md exists, then begin
Phase 5. Build every file in order from TASK_BREAKDOWN.md
tasks P5-01 through P5-10. Run npm run build when done —
it must complete with 0 errors.
```
**Done when:** `agents/status/agent3_done.md` exists and PR is open.
**Estimated requests:** ~40

---

### Session 6 — Agent 5 Testing (final phase)
**Agent:** AquaGuard QA Engineer
**Prerequisite:** agent1_done.md AND agent2_done.md must both exist
**Starting prompt:**
```
Check that both agents/status/agent1_done.md and agent2_done.md
exist. Then build scripts/test_camera.py and scripts/latency_test.py,
run all test suites, and write the integration report.
```
**Done when:** `agents/status/agent5_integration_report.md` exists.
**Estimated requests:** ~20

---

## Managing Your Premium Request Limit

### Check how many you have left
Go to: `github.com/settings/copilot`
Look for "Premium requests" usage.

### Check your reset date
Same page — note the date your monthly limit resets.

### If you run out mid-session
The agent will stop responding or give degraded answers.
- Save your progress note: which task was last completed
- Wait for reset date
- Come back and send: `Continue from task P{X}-{Y} in TASK_BREAKDOWN.md`

### Request budget across all 6 sessions
| Session | Estimated Requests |
|---|---|
| Orchestrator | ~10 |
| ESP32 | ~10 |
| CV Engine | ~40 |
| Backend | ~40 |
| Frontend | ~40 |
| Testing | ~20 |
| **Total** | **~160 requests** |

160 requests across your monthly limit. If you're at 90% now,
wait for your reset date before starting Session 3 (CV Engine).
Sessions 1 and 2 (Orchestrator + ESP32) only need ~20 requests
which you likely still have available.

---

## Resuming a Paused Agent Session

If Copilot stops mid-phase, start a new chat conversation,
select the same agent, and send:

```
I was in the middle of Phase {N}. The last completed task
was {task ID} in TASK_BREAKDOWN.md. Read the current state
of the codebase and continue from the next incomplete task.
```

The agent will read the existing files and pick up where it left off.

---

## Merging All PRs Yourself

Since you are alone, you review and merge your own PRs:

1. Go to github.com/YOUR_USERNAME/aquaguard → Pull Requests
2. Review each agent's PR
3. Check CI is green
4. Merge using **Squash and Merge**
5. Delete the feature branch after merge

Merge order:
```
feature/agent4-esp32       → develop (any time)
feature/agent1-cv-engine   → develop
feature/agent2-backend-api → develop
feature/agent3-frontend    → develop (after agent2 merged)
feature/agent5-testing     → develop (last)
develop                    → main (final release)
```

---

## After All Sessions Complete

Run local GPU verification on your RTX 2050:

```bash
conda activate aquaguard_env
python detection_engine/benchmark.py     # see actual inference ms
python scripts/test_camera.py            # test your webcam
python scripts/latency_test.py           # must be ≤ 3000ms
```

Then start all services to test the full system:

```bash
# Terminal 1 — MQTT broker
mosquitto -c mqtt/mosquitto.conf

# Terminal 2 — Flask backend
cd backend && conda activate aquaguard_env && flask run --port=5000

# Terminal 3 — React dashboard
cd frontend && npm start

# Terminal 4 — Detection engine
conda activate aquaguard_env && python detection_engine/main.py
```

Open browser at http://localhost:3000 and verify the dashboard loads.

---

## Quick Start Right Now

You still have ~10% of requests left this month.
Use them for the two fastest sessions:

**Right now:**
1. `conda activate aquaguard_env`
2. Open Copilot Chat → select Claude → select AquaGuard Orchestrator
3. Run Session 1 (Orchestrator) — ~10 requests
4. Run Session 2 (ESP32) — ~10 requests

**After your limit resets:**
5. Run Session 3 (CV Engine) — biggest phase, needs full budget
6. Continue Sessions 4, 5, 6 in order
