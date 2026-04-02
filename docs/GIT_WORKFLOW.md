# AquaGuard — Git & GitHub Workflow

> All agents must read this file as part of their startup sequence.
> This defines the complete branching strategy, commit conventions,
> pull request workflow, and CI/CD pipeline for the AquaGuard project.

---

## Repository Setup (Orchestrator Does This Once)

```bash
# Initialize repo from AquaGuard/ root
git init
git remote add origin https://github.com/{your-username}/aquaguard.git

# Create and push the base branch structure
git checkout -b main
git add docs/ agents/ .gitignore README.md
git commit -m "chore(repo): initial project structure and documentation"
git push -u origin main

# Create dev branch — all feature work merges here first
git checkout -b dev
git push -u origin dev
```
After this, the Orchestrator sets up branch protection (see Section 6).

---

## Branch Strategy

```
main
 └── dev
      ├── feature/agent1-cv-engine
      ├── feature/agent2-backend-api
      ├── feature/agent3-frontend-dashboard
      ├── feature/agent4-esp32-firmware
      └── feature/agent5-testing
```
| Branch | Purpose | Who Pushes | Merges Into |
|---|---|---|---|
| `main` | Production-ready code only | Nobody directly | — |
| `dev` | Integration branch | Via PR from feature | `main` (via PR) |
| `feature/agent{N}-*` | Each agent's work | The agent | `dev` (via PR) |
| `fix/agent{N}-*` | Bug fixes after review | The agent | `dev` (via PR) |

**Rules:**

- No agent pushes directly to `main` or `dev`
- Every merge to `dev` goes through a Pull Request
- Every merge to `main` goes through a Pull Request from `dev`
- Feature branches are created from `dev`, not from `main`

---

## Each Agent's Git Startup

Before writing any code, every agent creates their feature branch:

```bash
# Make sure you're on dev and it's up to date
git checkout dev
git pull origin dev

# Create your feature branch
git checkout -b feature/agent1-cv-engine     # Agent 1
git checkout -b feature/agent2-backend-api   # Agent 2
git checkout -b feature/agent3-frontend      # Agent 3
git checkout -b feature/agent4-esp32         # Agent 4
git checkout -b feature/agent5-testing       # Agent 5
```
All work is done on your feature branch. Never commit directly to `dev`.

---

## Commit Conventions

### Format

```
type(scope): short description (max 72 chars)

Optional longer body explaining WHY, not WHAT.
Reference task ID from TASK_BREAKDOWN.md.
```
### Types

| Type | When to Use |
|---|---|
| `feat` | New file or new functionality |
| `fix` | Bug fix |
| `test` | Adding or fixing tests |
| `chore` | Config, tooling, dependencies |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behavior change |
| `style` | Formatting only |

### Scope = the module or layer you're in

```
feat(detector): implement DrowningDetector with YOLOv11s CUDA inference
feat(pose): add MediaPipe landmark extraction with ROI cropping
feat(analyzer): implement 5-indicator drowning behavior scoring
fix(analyzer): correct MediaPipe normalized coordinate threshold (0.015 not 15)
feat(filter): implement rolling window confidence filter (N=15, T=0.75, K=10)
feat(mqtt): add paho-mqtt 2.x client with VERSION2 callback signatures
feat(alert): implement AlertEngine with threaded MQTT and API dispatch
feat(camera): add CameraCapture with exponential backoff reconnect
feat(main): implement per-camera DrowningDetector instantiation
test(detector): add unit tests for YOLOv11s inference wrapper
feat(auth): add JWT login and refresh endpoints
feat(models): define all 5 SQLAlchemy models with to_dict()
feat(events): add detection event logging endpoint with socketio emit
feat(sockets): initialize Flask-SocketIO with async_mode=threading
feat(dashboard): implement AlertPanel with WebSocket integration
feat(camera-ui): add CameraGrid with MJPEG stream display
chore(deps): add mediapipe==0.10.14 to requirements.txt
test(backend): add conftest.py with in-memory SQLite fixtures
```
### One Commit Per TASK_BREAKDOWN Task

```bash
# Complete task P2-04 (YOLOv11 detector)
# ... write the file ...
# ... verify it runs ...
git add detection_engine/vision/detector.py
git commit -m "feat(detector): implement DrowningDetector with YOLOv11s CUDA inference

Implements per-instance ByteTrack tracking with persist=True.
One instance required per camera zone (see AGENT_RULES R6-A).
Task: P2-04"
```
---

## When to Commit

Commit after each completed, verified task — not after each file,
not after the entire phase.

```
P2-04 done and verified → commit
P2-05 done and verified → commit
P2-06 done and verified → commit
...NOT: finish all of Phase 2 → one big commit
```
---

## Pushing to GitHub

Push your feature branch regularly — after every 3–5 commits:

```bash
git push origin feature/agent1-cv-engine
```
This ensures work is backed up and visible to the Orchestrator.

---

## Pull Request Workflow

When an agent completes their full phase and all tests pass:

### Step 1 — Sync with dev before opening PR

```bash
git checkout dev
git pull origin dev
git checkout feature/agent1-cv-engine
git rebase dev    # replay your commits on top of latest dev
# Resolve any conflicts, then:
git push origin feature/agent1-cv-engine --force-with-lease
```
### Step 2 — Open Pull Request on GitHub

PR title format:

```
feat(agent1): complete CV/AI detection engine — Phase 2
```
PR body template (use `.github/pull_request_template.md`):

```markdown
## Summary
Brief description of what this PR implements.

## Tasks Completed
- [x] P2-01 — Frame preprocessor
- [x] P2-02 — Camera capture
- [x] P2-03 — Camera registry
- [x] P2-04 — YOLOv11s detector
- [x] P2-05 — Pose estimator
- [x] P2-06 — Behavior analyzer
- [x] P2-07 — Confidence filter
- [x] P2-08 — MQTT client
- [x] P2-09 — API client
- [x] P2-10 — Alert engine
- [x] P2-11 — Main loop

## Test Results
- pytest detection_engine/tests/ — X passed, 0 failed
- Benchmark: Xms average inference

## Critical Rules Verified
- [x] R6-A: One DrowningDetector per camera
- [x] R6-B: MediaPipe threshold 0.015 (normalized)
- [x] R6-G: Snapshot path uses os.path.abspath(__file__)
- [x] Rule 9: All I/O exceptions handled

## Notes
Any known limitations or follow-up items.
```
### Step 3 — Orchestrator Reviews and Merges

The Orchestrator reviews the PR on GitHub:

- Checks that CI passes (GitHub Actions)
- Checks that no files outside scope were modified
- Merges using **Squash and Merge** for clean history

---

## GitHub Actions CI/CD

**File:** `.github/workflows/ci.yml`

The Orchestrator creates this file during repo setup:

```yaml
name: AquaGuard CI

on:
  push:
    branches: [ dev, 'feature/**', 'fix/**' ]
  pull_request:
    branches: [ dev, main ]

jobs:

  test-backend:
    name: Backend Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install backend dependencies
        run: |
          pip install flask==3.0.3 flask-socketio==5.3.6 flask-jwt-extended==4.6.0
          pip install flask-sqlalchemy==3.1.1 flask-migrate==4.0.7 flask-cors==4.0.1
          pip install flask-bcrypt==1.0.1 python-socketio==5.11.3 python-engineio==4.9.1
          pip install python-dotenv==1.0.1 pymysql==1.1.1 requests==2.32.3
          pip install pytest==8.3.3 pytest-cov==5.0.0 pytest-mock==3.14.0 httpx==0.27.2

      - name: Run backend tests
        run: |
          cd backend
          pytest tests/ -v --cov=. --cov-report=xml
        env:
          DATABASE_URL: sqlite:///test_aquaguard.db
          JWT_SECRET_KEY: ci-test-secret-key-not-for-production
          MQTT_BROKER_HOST: localhost
          MQTT_BROKER_PORT: 1883

      - name: Upload coverage report
        uses: codecov/codecov-action@v4
        with:
          file: backend/coverage.xml
          flags: backend

  test-detection-engine:
    name: Detection Engine Tests (CPU only in CI)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install detection engine dependencies
        run: |
          pip install torch==2.2.2 torchvision==0.17.2 --index-url https://download.pytorch.org/whl/cpu
          pip install ultralytics==8.3.0 mediapipe==0.10.14 opencv-python-headless==4.10.0.84
          pip install numpy==1.26.4 paho-mqtt==2.1.0 requests==2.32.3
          pip install pytest==8.3.3 pytest-cov==5.0.0 pytest-mock==3.14.0

      - name: Run detection engine tests (CPU mode)
        run: |
          pytest detection_engine/tests/ -v --cov=detection_engine --cov-report=xml

      - name: Upload coverage report
        uses: codecov/codecov-action@v4
        with:
          file: coverage.xml
          flags: detection-engine

  test-frontend:
    name: Frontend Build and Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: |
          cd frontend
          npm ci

      - name: Run frontend tests
        run: |
          cd frontend
          npm test -- --watchAll=false --passWithNoTests
        env:
          CI: true

      - name: Build frontend
        run: |
          cd frontend
          npm run build
        env:
          REACT_APP_API_URL: http://localhost:5000
          REACT_APP_WS_URL: http://localhost:5000

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install linters
        run: pip install flake8==7.1.1

      - name: Lint Python (backend)
        run: flake8 backend/ --max-line-length=100 --exclude=migrations/

      - name: Lint Python (detection engine)
        run: flake8 detection_engine/ --max-line-length=100
```
---

## GitHub Repository Files

The Orchestrator also creates these files during setup:

### `.github/pull_request_template.md`

```markdown
## Summary
<!-- What does this PR implement? -->

## Tasks Completed
<!-- List tasks from TASK_BREAKDOWN.md with checkboxes -->

## Test Results
<!-- Paste pytest or npm test output summary -->

## Critical Rules Verified
- [x] No hardcoded config values (Rule 4)
- [x] Correct venv environment used (Rule 5)
- [x] All relevant R6-* technical rules followed (Rule 6)
- [x] All I/O operations have error handling (Rule 9)
- [x] No files outside agent scope modified (Rule 1)

## Linked Issues
<!-- Closes #issue-number if applicable -->
```
### `.github/CODEOWNERS`

```
# Global owners — Orchestrator reviews all PRs
* @{project-lead-github-username}

# Scope-specific ownership
/detection_engine/    @{jhocer-github-username}
/backend/             @{joshua-github-username}
/frontend/            @{arabella-github-username}
/esp32/               @{dranreb-github-username}
docs/                 @{josiel-github-username}
```
### `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Something is broken
---

**Module:** detection_engine / backend / frontend / esp32

**Task Reference:** P{phase}-{task} from TASK_BREAKDOWN.md

**Description:**
Clear description of the bug.

**Steps to Reproduce:**
1. ...
2. ...

**Expected Behavior:**
What should happen.

**Actual Behavior:**
What actually happens.

**Error Output:**
```paste error here```

**Agent Assigned:** Agent {N}
```
---

## Branch Protection Rules

The Orchestrator configures these on GitHub after the first push:

**For `main` branch:**

- Require pull request before merging ✅
- Require 1 approving review ✅
- Require status checks to pass (all 4 CI jobs) ✅
- Require branches to be up to date ✅
- Restrict who can push: nobody directly ✅

**For `dev` branch:**

- Require pull request before merging ✅
- Require status checks to pass (all 4 CI jobs) ✅
- Allow force push: disabled ✅

Set these at:
`GitHub → Repository → Settings → Branches → Add Rule`

---

## Release Workflow (End of Project)

When Agent 5 writes `agent5_done.md` and all PRs are merged to `dev`:

```bash

# Orchestrator merges dev → main

git checkout main
git pull origin main
git merge --no-ff dev -m "release: AquaGuard v1.0.0

Complete system implementation:
- YOLOv11s drowning detection engine
- Flask REST API + WebSocket backend
- React real-time monitoring dashboard
- ESP32 physical alarm firmware
- Full test suite: XX% coverage"

git tag -a v1.0.0 -m "AquaGuard v1.0.0 — Initial release"
git push origin main
git push origin v1.0.0
```
Then create a GitHub Release:

- Tag: `v1.0.0`
- Title: `AquaGuard v1.0.0`
- Body: Summary of all implemented features, team credits, known limitations

---

## Daily Workflow Summary for Every Agent

```bash

# Start of work session

git checkout feature/agent{N}-{scope}
git pull origin dev
git rebase dev   # stay current with other agents' merged work

# During work — after each completed task

git add {files you changed}
git status           # verify only your scope files are staged
git commit -m "feat(scope): description  Task: P{X}-{Y}"

# Every few hours — push backup to GitHub

git push origin feature/agent{N}-{scope}

# End of phase — open PR

git rebase dev
git push origin feature/agent{N}-{scope} --force-with-lease

# Then open PR on GitHub using the PR template

```
---

## Git Commands Quick Reference

```bash

# See what you've changed

git status
git diff

# See your commit history

git log --oneline -20

# Undo last commit (keep changes)

git reset --soft HEAD~1

# Check which files are in staging

git diff --staged

# See all branches

git branch -a

# Delete merged feature branch (after PR is merged)

git branch -d feature/agent1-cv-engine
git push origin --delete feature/agent1-cv-engine

# Resolve rebase conflict

git rebase dev

# → edit conflicted files

git add {resolved files}
git rebase --continue
```
