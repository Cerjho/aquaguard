# AquaGuard — Agent Instructions

This is the AquaGuard IoT drowning detection system.

______________________________________________________________________

## Before Any Action

- Always read `docs/AGENT_RULES.md` before taking any action
- Always read `docs/GIT_WORKFLOW.md` before making any commits
- Always read `.github/copilot-instructions.md` for full coding
  and git rules

______________________________________________________________________

## Git Rules

- `main` is for releases only — never commit or push directly
  to `main` or `dev`
- Always work on a feature branch branched off `dev`
- Branch names must follow this format:
  `feat/` `fix/` `refactor/` `docs/` `test/` `chore/`
- Never create `copilot/*` `claude/*` or `worktree/*` branches
- One PR = one concern — never combine unrelated changes
- Always use `git merge --squash` — never plain `git merge`
- Delete feature branches immediately after merging
- Commit messages must follow Conventional Commits:
  `type(scope): short description`
- Allowed types:
  `feat` `fix` `refactor` `docs` `test` `chore` `perf` `style`

______________________________________________________________________

## Python Environment

- The venv is `aquaguard_env` — always activate it for Python
  commands
- Never reinstall `torch`, `ultralytics`, or `opencv` —
  they are already installed
- Never use `print()` in backend or detection code —
  use structured logging

______________________________________________________________________

## Never Commit These

- `*.pt` model files
- `.env` files
- `**pycache**`
- `node_modules`
- `snapshots/*.jpg`
- `*.db` database files
- Any file containing secrets or API keys

______________________________________________________________________

## Detection Engine Rules

- MediaPipe landmark coordinates are normalized `0.0–1.0` —
  never use pixel thresholds
- One `DrowningDetector` instance per camera zone —
  never share across cameras
- Snapshot path must be resolved with
  `os.path.abspath(**file**)` in `main.py`
- Always validate frame input before processing —
  skip if frame is None or empty
- Cap all in-memory buffers to prevent unbounded memory growth

______________________________________________________________________

## Backend Rules

- `Flask-SocketIO` must use `async_mode='threading'`
- `socketio.emit()` must always come after `db.session.commit()`
- Import `socketio` from `extensions.py` —
  never re-initialize in route files
- `bcrypt.generate_password_hash()` must always be followed
  by `.decode('utf-8')`
- `conftest.py` must be created before any test file
  in `backend/tests/`
- `paho-mqtt` 2.x `on_connect` requires 5 args:
  `client, userdata, connect_flags, reason_code, properties`
- Never use raw SQL strings — always use SQLAlchemy ORM
- Never use `Query.get()` — use `db.session.get()` instead
- Never expose database errors or stack traces in API responses

______________________________________________________________________

## Frontend Rules

- All URLs in React components must come from
  `frontend/src/utils/constants.js` via `process.env`
- Never use class components — functional components only
- Always clean up `useEffect` subscriptions and timers
- Never use `var` — use `const` or `let` only

______________________________________________________________________

## Testing Rules

- Every new feature must include at least one unit test
- Every bug fix must include a regression test
- Never use real credentials or live camera URLs in tests
- Mock all external dependencies in unit tests
