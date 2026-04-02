# AquaGuard — Agent Rules

> Every agent MUST read this file completely before reading any other file
> or writing any code. These rules are non-negotiable and override any
> assumption the agent might make on its own.

---

## Rule 0 — Read Before You Write

Before creating or modifying any file, the agent must have read:

1. `agents/AGENT_RULES.md` (this file)
2. `docs/REPO_STRUCTURE.md` — know where every file lives
3. `docs/TECH_STACK_LOCK.md` — know the exact versions and compatibility notes
4. `docs/IMPLEMENTATION_PLAN.md` — know the full build instructions
5. `docs/TASK_BREAKDOWN.md` — know which specific tasks belong to your scope
6. `docs/GIT_WORKFLOW.md` — know the branching strategy, commit format, and PR process
7. `docs/VS_CODE_SETUP.md` — know the development environment and tooling

No file may be created before all seven documents are read. If any document
is missing, stop and report to `agents/status/{your_agent_id}_blocked.md`.

---

## Rule 1 — Stay In Your Scope

Each agent has a defined scope. Never write files outside it.

| Agent | Owns | Never Touches |
|---|---|---|
| Orchestrator | `agents/queue/`, `agents/status/` | Application code |
| Agent 1 — CV | `detection_engine/`, `config/` | `backend/`, `frontend/`, `esp32/` |
| Agent 2 — Backend | `backend/` | `detection_engine/`, `frontend/`, `esp32/` |
| Agent 3 — Frontend | `frontend/` | `backend/`, `detection_engine/`, `esp32/` |
| Agent 4 — ESP32 | `esp32/`, `scripts/test_mqtt.py` | All Python app code |
| Agent 5 — Testing | `scripts/` (except test_mqtt.py if agent4 wrote it) | Application source files |

If a task requires changing a file outside your scope, write the needed
change to `agents/queue/fix_{target_agent}.md` and wait. Never edit
another agent's files directly.

---

## Rule 2 — File Creation Order Is Mandatory

Within each agent's scope, files must be built in the exact order listed
in `docs/TASK_BREAKDOWN.md` for that phase. Do not skip ahead.

**Why this matters:**

- `extensions.py` must exist before `app.py` or any route file
- `conftest.py` must exist before any test file
- `constants.js` must exist before any React component
- `config/settings.py` must exist before any detection engine module
- `models_data/` dataclasses must exist before any module that imports them

If you create files out of order, import errors will cascade and waste time.

---

## Rule 3 — Verify After Every File

After creating each file, immediately verify it does not have import errors:

**Python:**

```bash
.\aquaguard_env\Scripts\Activate.ps1
python -c "import detection_engine.vision.detector"   # adjust path
```text

**React/JS:**

```bash
cd frontend && npm run build 2>&1 | tail -20
```text

If verification fails, fix the file before moving to the next task.
Do not accumulate broken files — fix each one before proceeding.

---

## Rule 4 — Never Hardcode Configuration Values

All of the following must come from config files or environment variables.
Never write these directly into application code:

| Value | Where It Lives |
|---|---|
| Confidence thresholds (N, T, K) | `config/settings.py` |
| MQTT topics and broker address | `config/settings.py` |
| Camera RTSP URLs | `config/cameras.json` |
| Flask secret keys | `backend/.env` |
| Database URLs | `backend/.env` |
| React API URLs | `frontend/.env` → `frontend/src/utils/constants.js` |
| ESP32 WiFi credentials | `esp32/aquaguard_esp32/config.h` |
| GPIO pin numbers | `esp32/aquaguard_esp32/config.h` |

If you find yourself typing `0.75` or `"localhost:1883"` or
`"http://localhost:5000"` directly into a source file — stop.
Put it in the correct config location first.

---

## Rule 5 — Environment Is aquaguard_env

Every Python command must run inside `aquaguard_env`.

```bash
.\aquaguard_env\Scripts\Activate.ps1
```text

- Do NOT create a new virtual environment
- Do NOT run `pip install -r requirements.txt` from scratch
- Do NOT reinstall torch, ultralytics, or opencv
- Only install packages that are genuinely missing using targeted
  `pip install package==version` commands from TECH_STACK_LOCK.md

If a package import fails, check TECH_STACK_LOCK.md for the exact
install command before installing anything.

---

## Rule 6 — Critical Technical Rules (Must Not Be Violated)

These are the exact failure points identified during design review.
Violating any of these will cause silent bugs or runtime crashes.

### R6-A — One DrowningDetector Per Camera

```python
# WRONG — corrupts ByteTrack state across cameras
detector = DrowningDetector(model_path)
for zone_id, camera in registry.cameras.items():
    detections = detector.detect(frame)  # ← NEVER do this

# CORRECT — one instance per zone
detectors = {zone_id: DrowningDetector(model_path)
             for zone_id in registry.cameras.keys()}
```text

### R6-B — MediaPipe Coordinates Are Normalized, Not Pixels

```python
# WRONG
if std_dev_wrist_x < 15:      # 15 pixels — MediaPipe never returns pixels

# CORRECT
if std_dev_wrist_x < 0.015:   # 0.015 normalized units (0.0–1.0 range)
```text

### R6-C — Flask-SocketIO Must Use async_mode='threading'

```python
# WRONG — WebSocket connections will hang
socketio = SocketIO()
socketio = SocketIO(cors_allowed_origins="*")

# CORRECT
socketio = SocketIO(async_mode='threading', cors_allowed_origins="*")
```text

### R6-D — socketio.emit Must Come After db.session.commit()

```python
# WRONG — emitting before commit means alert_id doesn't exist yet
socketio.emit('alert_event', alert.to_dict())
db.session.commit()

# CORRECT
db.session.commit()
socketio.emit('alert_event', alert.to_dict())
```text

### R6-E — Import socketio From extensions.py in Routes

```python
# WRONG — creates a second unconnected SocketIO instance
from flask_socketio import SocketIO
socketio = SocketIO()
socketio.emit(...)

# CORRECT — use the shared instance initialized in create_app()
from extensions import socketio
socketio.emit('alert_event', data)
```text

### R6-F — paho-mqtt 2.x Callback Signatures

```python
# WRONG — old 1.x signatures raise TypeError at runtime
def on_connect(client, userdata, flags, rc): ...
def on_disconnect(client, userdata, rc): ...

# CORRECT — 2.x requires 5 arguments
def on_connect(client, userdata, connect_flags, reason_code, properties): ...
def on_disconnect(client, userdata, disconnect_flags, reason_code, properties): ...
```text

### R6-G — Snapshot Path Must Be Absolute

```python
# WRONG — breaks when detection engine runs from a different working dir
snapshot_path = "backend/snapshots/"

# CORRECT — resolve absolute path using __file__ in main.py
import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAPSHOT_DIR = os.path.join(BASE_DIR, 'backend', 'snapshots')
os.makedirs(SNAPSHOT_DIR, exist_ok=True)
alert_engine = AlertEngine(mqtt_client, api_client, snapshot_dir=SNAPSHOT_DIR)
```text

### R6-H — Never Hardcode URLs in React Components

```javascript
// WRONG — breaks when API URL changes
const response = await axios.get('http://localhost:5000/api/v1/cameras');

// CORRECT — always use the shared api instance
import api from '../hooks/useApi';
const response = await api.get('/api/v1/cameras');
```text

### R6-I — bcrypt Passwords Must Be Decoded to String

```python
# WRONG — stores bytes object in DB, breaks string comparison
password_hash = bcrypt.generate_password_hash('password')

# CORRECT — decode to UTF-8 string
password_hash = bcrypt.generate_password_hash('password').decode('utf-8')
```text

### R6-J — conftest.py Must Be Created Before Any Test File

```text
# WRONG order
backend/tests/test_auth.py        ← created first, imports fixtures that don't exist
backend/tests/conftest.py         ← created second

# CORRECT order
backend/tests/conftest.py         ← always first
backend/tests/test_auth.py        ← then test files
```text

---

## Rule 7 — Status Reporting

After completing your assigned phase, write a status report to
`agents/status/{your_agent_id}_done.md` with the following format:

```markdown
# Agent {ID} — Completion Report

**Status:** COMPLETE | BLOCKED | PARTIAL

## Files Created
- path/to/file1.py — description
- path/to/file2.py — description

## Tests Run
- pytest detection_engine/tests/ — X passed, Y failed
- (or) npm run build — success / errors

## Issues Encountered
- List any problems and how they were resolved

## Blockers (if status is BLOCKED)
- What is blocking you
- Which agent or human needs to resolve it

## Next Agent Dependencies
- Agent 3 can now start (backend API is stable)
- (or) No downstream dependencies
```text

If you are blocked mid-task, immediately write to
`agents/status/{your_agent_id}_blocked.md` — do not continue
guessing. Wait for the orchestrator to provide a fix via
`agents/queue/fix_{your_agent_id}.md`.

---

## Rule 8 — Do Not Duplicate Code

Before writing a new utility function, check if it already exists:

```bash
grep -r "def function_name" detection_engine/
grep -r "function_name" frontend/src/
```text

If the function exists in another module in your scope, import it.
If it exists in another agent's scope, request it via the queue.

---

## Rule 9 — Error Handling Is Not Optional

Every function that does I/O must handle failures gracefully:

- **Camera read failure** → log warning, return `None`, trigger reconnect
- **MQTT publish failure** → log error, do NOT crash the detection loop
- **Flask API POST failure** → log error, queue the payload for retry
- **CUDA out of memory** → log error, fall back to CPU for that frame
- **MediaPipe returns None** → skip that detection, continue loop
- **DB commit failure** → log error, roll back session, return 500

The detection loop must NEVER crash due to a single bad frame,
failed network call, or transient hardware error.

---

## Rule 10 — Git and GitHub Workflow

Full details are in `docs/GIT_WORKFLOW.md`. This rule is a summary of
the non-negotiable requirements. Violations will be caught in PR review.

### R10-A — Branch Before You Code

Every agent creates their feature branch from `dev` before writing
any application code:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/agent{N}-{scope}
# examples:
# feature/agent1-cv-engine
# feature/agent2-backend-api
# feature/agent3-frontend
# feature/agent4-esp32
# feature/agent5-testing
```text

Never commit directly to `main` or `dev`.

### R10-B — One Commit Per Task

Commit after each completed, verified task from TASK_BREAKDOWN.md.
Not after each file. Not after the whole phase. One commit per task.

```bash
# After completing and verifying task P2-04:
git add detection_engine/vision/detector.py
git commit -m "feat(detector): implement DrowningDetector with YOLOv11s CUDA inference

One instance per camera zone — ByteTrack state must not be shared.
Task: P2-04"
```text

### R10-C — Commit Message Format

```text
type(scope): short description

Optional body explaining WHY.
Task: P{phase}-{task}
```text

Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `style`

### R10-D — Push Regularly

Push to your feature branch after every 3–5 commits — do not wait
until the phase is complete. This backs up work and lets the
Orchestrator monitor progress:

```bash
git push origin feature/agent{N}-{scope}
```text

### R10-E — Sync With dev Before Opening PR

```bash
git checkout dev && git pull origin dev
git checkout feature/agent{N}-{scope}
git rebase dev
git push origin feature/agent{N}-{scope} --force-with-lease
```text

### R10-F — Open a Pull Request for Every Phase Completion

When your phase is done and all tests pass, open a PR on GitHub:

- Base branch: `dev`
- Compare branch: your `feature/agent{N}-{scope}`
- Title format: `feat(agent{N}): complete {scope} — Phase {N}`
- Fill in the PR template from `.github/pull_request_template.md`
- Link to your `agents/status/{id}_done.md` in the PR body

The Orchestrator reviews and merges using **Squash and Merge**.

### R10-G — Never Commit These Files

```gitignore
detection_engine/models/*.pt    # model weights — too large
backend/.env                    # secrets
frontend/.env                   # secrets
__pycache__/                    # Python cache
*.pyc                           # compiled Python
node_modules/                   # npm packages
backend/snapshots/*.jpg         # runtime snapshots
*.db                            # SQLite database files
```text

Run `git status` before every commit. If any of the above appear
in the staging area, remove them with `git reset HEAD {file}`.

### R10-H — CI Must Pass Before Merge

Every PR triggers GitHub Actions CI (`.github/workflows/ci.yml`).
All 4 jobs must be green before the Orchestrator merges:

- `test-backend`
- `test-detection-engine`
- `test-frontend`
- `lint`

If CI fails on your PR, fix the issue and push again. Do not ask
the Orchestrator to merge a red PR.

---

## Rule 11 — Ask, Don't Assume

If any instruction in the docs is ambiguous or contradicts another
instruction, do NOT guess. Write the ambiguity to:

```text
agents/status/{your_agent_id}_question.md
```text

Format:

```markdown
# Question from Agent {ID}

**File I am trying to create:** path/to/file.py
**Ambiguity:** Section X says Y but Section Z says W
**My best interpretation:** ...
**Blocked until resolved:** yes/no
```text

The orchestrator will resolve it. Do not proceed on an ambiguous
instruction that affects system correctness.

---

## Rule 12 — Model Weights Are Sacred

The file `detection_engine/models/aquaguard_yolov11s.pt` is the
trained model. Agents must:

- Never delete or overwrite it
- Never move it from its defined path
- Never attempt to re-download or re-train it
- Always verify it loads correctly with:

  ```python
  from ultralytics import YOLO
  model = YOLO("detection_engine/models/aquaguard_yolov11s.pt")
  model.info()
  ```

- If the file is missing, write to `agents/status/blocked_no_model.md`
  and stop. A human must provide the weights file.

---

## Quick Reference — Critical File Locations

| What | Where |
|---|---|
| All thresholds and constants | `config/settings.py` |
| Camera zone definitions | `config/cameras.json` |
| Trained model weights | `detection_engine/models/aquaguard_yolov11s.pt` |
| Flask extensions (db, jwt, socketio) | `backend/extensions.py` |
| Backend environment variables | `backend/.env` |
| Pytest fixtures for backend tests | `backend/tests/conftest.py` |
| React URL constants | `frontend/src/utils/constants.js` |
| Axios instance with JWT | `frontend/src/hooks/useApi.js` |
| React env variables | `frontend/.env` |
| ESP32 WiFi and pin config | `esp32/aquaguard_esp32/config.h` |
| Agent task queue | `agents/queue/` |
| Agent completion reports | `agents/status/` |