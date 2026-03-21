# AquaGuard — Agent Instructions

This is the AquaGuard IoT drowning detection system.
Always read docs/AGENT_RULES.md before taking any action.
Always read docs/GIT_WORKFLOW.md before making any commits.
The venv (virtual environment) is aquaguard_env — always use it for Python commands.
Never reinstall torch, ultralytics, or opencv — they are already installed.
Never commit: *.pt files, .env files, __pycache__, node_modules, snapshots/*.jpg.
MediaPipe landmark coordinates are normalized 0.0–1.0 — never use pixel thresholds.
One DrowningDetector instance per camera zone — never share across cameras.
Flask-SocketIO must use async_mode='threading'.
socketio.emit() must come after db.session.commit().
Import socketio from extensions.py — never re-initialize in route files.
bcrypt.generate_password_hash() must always be followed by .decode('utf-8').
conftest.py must be created before any test file in backend/tests/.
Snapshot path must be resolved with os.path.abspath(__file__) in main.py.
paho-mqtt 2.x on_connect requires 5 args: client, userdata, connect_flags, reason_code, properties.
All URLs in React components must come from frontend/src/utils/constants.js via process.env.
Commit after each completed task in TASK_BREAKDOWN.md — one commit per task.
All commits go to feature branches — never push directly to main or develop.
