"""
scripts/integration_test.py
────────────────────────────
Task: P6-04 / P6-05 — End-to-end integration test harness.

What is tested
──────────────
  1. Backend module imports (app factory, models, extensions, routes)
  2. Detection engine module imports
  3. Config file validity  (JSON + Python)
  4. Full API surface via Flask test client (no live server needed)
  5. Critical rules verification (R6-C, R6-D, R6-E, R6-I)

Exit codes
──────────
  0 — all tests passed
  1 — one or more tests failed

Usage:
    conda activate aquaguard_env
    python scripts/integration_test.py
    python scripts/integration_test.py --verbose
"""

import argparse
import importlib
import inspect
import json
import os
import sys
import traceback
from datetime import datetime

# ── project root on sys.path ──────────────────────────────────────────────────
ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACK  = os.path.join(ROOT, 'backend')
DE    = ROOT   # detection_engine lives directly under ROOT

for path in (ROOT, BACK):
    if path not in sys.path:
        sys.path.insert(0, path)

# ── test result tracking ──────────────────────────────────────────────────────
PASS = '✓ PASS'
FAIL = '✗ FAIL'
SKIP = '~ SKIP'
WARN = '⚠ WARN'

results: list[tuple[str, str, str]] = []   # (category, test_name, outcome)


def record(category: str, name: str, outcome: str, detail: str = ''):
    tag = outcome[:6].strip()
    results.append((category, name, outcome))
    icon = {PASS: '  [PASS]', FAIL: '  [FAIL]', SKIP: '  [SKIP]', WARN: '  [WARN]'}.get(
        outcome, '  [    ]')
    detail_str = f'  → {detail}' if detail else ''
    print(f'{icon} {name}{detail_str}')


def section(title: str):
    print(f'\n{"─" * 65}')
    print(f'  {title}')
    print(f'{"─" * 65}')


# ═══════════════════════════════════════════════════════════════════════════════
# 1. BACKEND MODULE IMPORTS
# ═══════════════════════════════════════════════════════════════════════════════

def test_backend_imports():
    section('1. Backend Module Imports')

    modules = [
        ('extensions',         'backend/extensions.py'),
        ('models',             'backend/models.py'),
        ('app',                'backend/app.py'),
        ('auth_helpers',       'backend/auth_helpers.py'),
        ('sockets',            'backend/sockets.py'),
        ('routes.auth',        'backend/routes/auth.py'),
        ('routes.events',      'backend/routes/events.py'),
        ('routes.alerts',      'backend/routes/alerts.py'),
        ('routes.cameras',     'backend/routes/cameras.py'),
        ('routes.reports',     'backend/routes/reports.py'),
    ]

    # Set required env vars before importing
    os.environ.setdefault('DATABASE_URL',     'sqlite:///:memory:')
    os.environ.setdefault('JWT_SECRET_KEY',   'integration-test-secret-key')
    os.environ.setdefault('SECRET_KEY',       'integration-test-flask-secret')
    os.environ.setdefault('MQTT_BROKER_HOST', 'localhost')
    os.environ.setdefault('MQTT_BROKER_PORT', '1883')

    old_cwd = os.getcwd()
    os.chdir(BACK)

    for mod_name, file_hint in modules:
        try:
            importlib.import_module(mod_name)
            record('backend_import', mod_name, PASS)
        except Exception as exc:
            record('backend_import', mod_name, FAIL, str(exc)[:120])

    os.chdir(old_cwd)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. DETECTION ENGINE MODULE IMPORTS
# ═══════════════════════════════════════════════════════════════════════════════

def test_detection_engine_imports():
    section('2. Detection Engine Module Imports')

    de_modules = [
        'detection_engine.vision.preprocessor',
        'detection_engine.vision.detector',
        'detection_engine.vision.pose_estimator',
        'detection_engine.analysis.behavior_analyzer',
        'detection_engine.analysis.confidence_filter',
        'detection_engine.camera.capture',
        'detection_engine.camera.registry',
        'detection_engine.models_data.detection',
        'detection_engine.models_data.landmark',
        'detection_engine.models_data.alert_payload',
    ]

    for mod_name in de_modules:
        try:
            mod = importlib.import_module(mod_name)
            # Check module is not completely empty
            public_attrs = [a for a in dir(mod) if not a.startswith('_')]
            if not public_attrs:
                record('de_import', mod_name, WARN,
                       'module imported but is empty (no public symbols)')
            else:
                record('de_import', mod_name, PASS,
                       f'symbols: {", ".join(public_attrs[:5])}')
        except ImportError as exc:
            record('de_import', mod_name, FAIL, str(exc)[:120])
        except Exception as exc:
            record('de_import', mod_name, FAIL,
                   f'{type(exc).__name__}: {str(exc)[:100]}')


# ═══════════════════════════════════════════════════════════════════════════════
# 3. CONFIG FILE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

def test_config_files():
    section('3. Config File Validation')

    # cameras.json
    cameras_json = os.path.join(ROOT, 'config', 'cameras.json')
    if not os.path.exists(cameras_json):
        record('config', 'config/cameras.json exists', FAIL, 'file not found')
    else:
        try:
            with open(cameras_json) as f:
                data = json.load(f)
            assert 'cameras' in data, "'cameras' key missing"
            assert isinstance(data['cameras'], list), "'cameras' must be a list"
            assert len(data['cameras']) >= 1, "At least one camera must be defined"
            cam = data['cameras'][0]
            assert 'zone_id' in cam,    "camera entry missing 'zone_id'"
            assert 'rtsp_url' in cam,   "camera entry missing 'rtsp_url'"
            assert 'zone_name' in cam,  "camera entry missing 'zone_name'"
            record('config', 'config/cameras.json valid JSON + schema', PASS,
                   f'{len(data["cameras"])} camera(s) defined')
        except (json.JSONDecodeError, AssertionError) as exc:
            record('config', 'config/cameras.json valid JSON + schema', FAIL, str(exc))

    # settings.py
    settings_py = os.path.join(ROOT, 'config', 'settings.py')
    if not os.path.exists(settings_py):
        record('config', 'config/settings.py exists', FAIL, 'file not found')
    else:
        try:
            spec = importlib.util.spec_from_file_location('config.settings', settings_py)
            settings = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(settings)

            required_attrs = [
                'CONFIDENCE_WINDOW_SIZE',
                'CONFIDENCE_THRESHOLD',
                'LIMB_MOTION_STD_THRESHOLD',
                'MQTT_BROKER',
                'MQTT_PORT',
                'RECONNECT_BACKOFF_SECONDS',
                'ALARM_DURATION_SECONDS',
            ]
            missing = [a for a in required_attrs if not hasattr(settings, a)]
            if missing:
                record('config', 'config/settings.py has required constants', WARN,
                       f'missing: {missing}')
            else:
                record('config', 'config/settings.py has required constants', PASS)

            # Verify critical value: LIMB_MOTION_STD_THRESHOLD must be < 1.0
            threshold = getattr(settings, 'LIMB_MOTION_STD_THRESHOLD', None)
            if threshold is not None:
                if threshold < 1.0:
                    record('config', 'LIMB_MOTION_STD_THRESHOLD is normalised (< 1.0)',
                           PASS, f'value={threshold}  (Rule R6-B compliant)')
                else:
                    record('config', 'LIMB_MOTION_STD_THRESHOLD is normalised (< 1.0)',
                           FAIL, f'value={threshold}  PIXELS — violates Rule R6-B!')

        except Exception as exc:
            record('config', 'config/settings.py importable', FAIL,
                   f'{type(exc).__name__}: {str(exc)[:100]}')

    # .env.example
    env_example = os.path.join(ROOT, 'backend', '.env.example')
    if os.path.exists(env_example):
        record('config', 'backend/.env.example exists', PASS)
    else:
        record('config', 'backend/.env.example exists', WARN, 'file not found')


# ═══════════════════════════════════════════════════════════════════════════════
# 4. FLASK API ENDPOINT TESTS (test client)
# ═══════════════════════════════════════════════════════════════════════════════

def test_api_endpoints():
    section('4. Flask API Endpoint Tests (test client)')

    os.environ['DATABASE_URL']     = 'sqlite:///:memory:'
    os.environ['JWT_SECRET_KEY']   = 'integration-test-jwt-secret-32chars!!'
    os.environ['SECRET_KEY']       = 'integration-test-flask-key'
    os.environ['MQTT_BROKER_HOST'] = 'localhost'
    os.environ['MQTT_BROKER_PORT'] = '1883'

    old_cwd = os.getcwd()
    os.chdir(BACK)

    try:
        # Fresh import to pick up env vars
        for mod in list(sys.modules.keys()):
            if mod in ('app', 'extensions', 'models') or mod.startswith('routes'):
                del sys.modules[mod]

        from app import create_app
        from extensions import db as _db, bcrypt as _bcrypt
        from models import User

        flask_app = create_app()
        flask_app.config.update({
            'TESTING':                  True,
            'SQLALCHEMY_DATABASE_URI':  'sqlite:///:memory:',
            'JWT_SECRET_KEY':           'integration-test-jwt-secret-32chars!!',
            'WTF_CSRF_ENABLED':         False,
        })

        with flask_app.app_context():
            _db.create_all()
            # Seed admin user
            if not User.query.filter_by(username='testadmin').first():
                pw = _bcrypt.generate_password_hash('testpass').decode('utf-8')
                _db.session.add(User(username='testadmin', password_hash=pw, role='admin'))
                _db.session.commit()

        client = flask_app.test_client()

        # ── POST /api/v1/auth/login ──────────────────────────────────────────
        try:
            r = client.post('/api/v1/auth/login',
                            json={'username': 'testadmin', 'password': 'testpass'})
            assert r.status_code == 200, f'status={r.status_code}'
            data = r.get_json()
            assert 'access_token' in data
            assert 'refresh_token' in data
            assert data['user']['role'] == 'admin'
            access_token  = data['access_token']
            refresh_token = data['refresh_token']
            record('api', 'POST /api/v1/auth/login (success)', PASS)
        except Exception as exc:
            record('api', 'POST /api/v1/auth/login (success)', FAIL, str(exc)[:120])
            access_token  = None
            refresh_token = None

        # ── POST /api/v1/auth/login (wrong password) ─────────────────────────
        try:
            r = client.post('/api/v1/auth/login',
                            json={'username': 'testadmin', 'password': 'wrongpass'})
            assert r.status_code == 401, f'expected 401 got {r.status_code}'
            record('api', 'POST /api/v1/auth/login (wrong password → 401)', PASS)
        except Exception as exc:
            record('api', 'POST /api/v1/auth/login (wrong password → 401)', FAIL,
                   str(exc)[:120])

        # ── POST /api/v1/auth/refresh ────────────────────────────────────────
        if refresh_token:
            try:
                r = client.post('/api/v1/auth/refresh',
                                headers={'Authorization': f'Bearer {refresh_token}'})
                assert r.status_code == 200, f'status={r.status_code}'
                assert 'access_token' in r.get_json()
                record('api', 'POST /api/v1/auth/refresh', PASS)
            except Exception as exc:
                record('api', 'POST /api/v1/auth/refresh', FAIL, str(exc)[:120])

        auth_hdr = {'Authorization': f'Bearer {access_token}'} if access_token else {}

        # ── GET /api/v1/cameras (requires auth) ──────────────────────────────
        try:
            r = client.get('/api/v1/cameras', headers=auth_hdr)
            assert r.status_code == 200, f'status={r.status_code}'
            assert isinstance(r.get_json(), list)
            record('api', 'GET /api/v1/cameras (authenticated)', PASS)
        except Exception as exc:
            record('api', 'GET /api/v1/cameras (authenticated)', FAIL, str(exc)[:120])

        # ── GET /api/v1/cameras (no auth → 401) ──────────────────────────────
        try:
            r = client.get('/api/v1/cameras')
            assert r.status_code == 401, f'expected 401 got {r.status_code}'
            record('api', 'GET /api/v1/cameras (unauthenticated → 401)', PASS)
        except Exception as exc:
            record('api', 'GET /api/v1/cameras (unauthenticated → 401)', FAIL,
                   str(exc)[:120])

        # ── POST /api/v1/cameras ──────────────────────────────────────────────
        try:
            r = client.post('/api/v1/cameras', json={
                'zone_id':   'zone_integration_test',
                'zone_name': 'Integration Test Zone',
                'rtsp_url':  'rtsp://localhost/test',
            }, headers=auth_hdr)
            assert r.status_code == 201, f'status={r.status_code}'
            assert r.get_json()['zone_id'] == 'zone_integration_test'
            record('api', 'POST /api/v1/cameras (admin)', PASS)
        except Exception as exc:
            record('api', 'POST /api/v1/cameras (admin)', FAIL, str(exc)[:120])

        # ── POST /api/v1/events ───────────────────────────────────────────────
        try:
            payload = {
                'zone_id':          'zone_01',
                'track_id':         42,
                'confidence_score': 0.91,
                'behavior_flags':   {'vertical': True},
                'alert_triggered':  False,
                'detected_at':      datetime.utcnow().isoformat(),
            }
            r = client.post('/api/v1/events', json=payload)
            assert r.status_code == 201, f'status={r.status_code}'
            data = r.get_json()
            assert 'event_id' in data
            event_id = data['event_id']
            record('api', 'POST /api/v1/events', PASS, f'event_id={event_id[:8]}…')
        except Exception as exc:
            record('api', 'POST /api/v1/events', FAIL, str(exc)[:120])
            event_id = None

        # ── POST /api/v1/events (with alert) ──────────────────────────────────
        alert_id = None
        try:
            payload = {
                'zone_id':          'zone_01',
                'track_id':         43,
                'confidence_score': 0.95,
                'behavior_flags':   {'vertical': True, 'arms_elevated': True},
                'alert_triggered':  True,
                'detected_at':      datetime.utcnow().isoformat(),
            }
            r = client.post('/api/v1/events', json=payload)
            assert r.status_code == 201, f'status={r.status_code}'
            data = r.get_json()
            assert data['alert_triggered'] is True
            assert 'alert' in data
            alert_id = data['alert']['alert_id']
            record('api', 'POST /api/v1/events (alert_triggered=True)', PASS,
                   f'alert_id={alert_id[:8]}…')
        except Exception as exc:
            record('api', 'POST /api/v1/events (alert_triggered=True)', FAIL,
                   str(exc)[:120])

        # ── GET /api/v1/events (authenticated) ───────────────────────────────
        try:
            r = client.get('/api/v1/events', headers=auth_hdr)
            assert r.status_code == 200, f'status={r.status_code}'
            data = r.get_json()
            assert 'items' in data and 'total' in data
            record('api', 'GET /api/v1/events (authenticated)', PASS,
                   f'{data["total"]} event(s)')
        except Exception as exc:
            record('api', 'GET /api/v1/events (authenticated)', FAIL, str(exc)[:120])

        # ── GET /api/v1/alerts ────────────────────────────────────────────────
        try:
            r = client.get('/api/v1/alerts', headers=auth_hdr)
            assert r.status_code == 200, f'status={r.status_code}'
            assert isinstance(r.get_json(), list)
            record('api', 'GET /api/v1/alerts', PASS,
                   f'{len(r.get_json())} alert(s)')
        except Exception as exc:
            record('api', 'GET /api/v1/alerts', FAIL, str(exc)[:120])

        # ── POST /api/v1/alerts/<id>/acknowledge ──────────────────────────────
        if alert_id:
            try:
                r = client.post(
                    f'/api/v1/alerts/{alert_id}/acknowledge',
                    json={'notes': 'integration test ack'},
                    headers=auth_hdr,
                )
                assert r.status_code == 200, f'status={r.status_code}'
                data = r.get_json()
                assert data['status'] == 'acknowledged'
                record('api', 'POST /api/v1/alerts/<id>/acknowledge', PASS)
            except Exception as exc:
                record('api', 'POST /api/v1/alerts/<id>/acknowledge', FAIL,
                       str(exc)[:120])

        # ── GET /api/v1/reports/summary ───────────────────────────────────────
        try:
            r = client.get('/api/v1/reports/summary', headers=auth_hdr)
            assert r.status_code == 200, f'status={r.status_code}'
            data = r.get_json()
            assert 'total_detections' in data
            assert 'confirmed_alerts' in data
            assert 'by_zone' in data
            record('api', 'GET /api/v1/reports/summary', PASS,
                   f'total_detections={data["total_detections"]}')
        except Exception as exc:
            record('api', 'GET /api/v1/reports/summary', FAIL, str(exc)[:120])

    except Exception as exc:
        record('api', 'Flask app creation', FAIL,
               f'{type(exc).__name__}: {str(exc)[:200]}')
        traceback.print_exc()

    finally:
        os.chdir(old_cwd)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. CRITICAL RULES VERIFICATION (source-code inspection)
# ═══════════════════════════════════════════════════════════════════════════════

def _read_file(rel_path: str) -> str:
    full = os.path.join(ROOT, rel_path)
    if not os.path.exists(full):
        return ''
    with open(full, encoding='utf-8', errors='replace') as f:
        return f.read()


def test_critical_rules():
    section('5. Critical Rules Verification (source inspection)')

    # R6-C — SocketIO must use async_mode='threading'
    extensions_src = _read_file('backend/extensions.py')
    if "async_mode='threading'" in extensions_src or 'async_mode="threading"' in extensions_src:
        record('rules', "R6-C: socketio uses async_mode='threading'", PASS)
    elif extensions_src:
        record('rules', "R6-C: socketio uses async_mode='threading'", FAIL,
               'async_mode not set or wrong value')
    else:
        record('rules', "R6-C: socketio uses async_mode='threading'", SKIP,
               'extensions.py not found')

    # R6-D — emit comes AFTER commit in events.py
    events_src = _read_file('backend/routes/events.py')
    if events_src:
        commit_pos = events_src.find('db.session.commit()')
        emit_pos   = events_src.find("socketio.emit('alert_event'")
        if commit_pos == -1:
            record('rules', 'R6-D: db.commit() before socketio.emit()', WARN,
                   'db.session.commit() not found in events.py')
        elif emit_pos == -1:
            record('rules', 'R6-D: db.commit() before socketio.emit()', WARN,
                   'socketio.emit() not found in events.py')
        elif commit_pos < emit_pos:
            record('rules', 'R6-D: db.commit() before socketio.emit()', PASS)
        else:
            record('rules', 'R6-D: db.commit() before socketio.emit()', FAIL,
                   'socketio.emit() appears BEFORE db.session.commit()!')
    else:
        record('rules', 'R6-D: db.commit() before socketio.emit()', SKIP,
               'events.py not found')

    # R6-E — routes import socketio from extensions, not re-instantiate
    for route_file in ('events.py', 'alerts.py', 'cameras.py', 'auth.py', 'reports.py'):
        src = _read_file(f'backend/routes/{route_file}')
        if not src:
            continue
        if 'from extensions import' in src and 'SocketIO()' not in src:
            record('rules', f'R6-E: {route_file} imports socketio from extensions', PASS)
        elif 'SocketIO()' in src:
            record('rules', f'R6-E: {route_file} imports socketio from extensions', FAIL,
                   'Creates a NEW SocketIO() instance — violates R6-E!')

    # R6-I — bcrypt passwords decoded to UTF-8 string
    for src_file in ('backend/routes/auth.py', 'backend/tests/conftest.py',
                     'backend/seed.py'):
        src = _read_file(src_file)
        if not src:
            continue
        if 'generate_password_hash' in src:
            if '.decode(' in src or ".decode('utf-8')" in src:
                record('rules', f'R6-I: {src_file} decodes bcrypt hash to str', PASS)
            else:
                record('rules', f'R6-I: {src_file} decodes bcrypt hash to str', FAIL,
                       '.decode("utf-8") missing — stores bytes in DB!')

    # R6-B — LIMB_MOTION_STD_THRESHOLD < 1.0 (normalized)
    settings_src = _read_file('config/settings.py')
    if settings_src:
        import re
        match = re.search(r'LIMB_MOTION_STD_THRESHOLD\s*=\s*([\d.]+)', settings_src)
        if match:
            val = float(match.group(1))
            if val < 1.0:
                record('rules', f'R6-B: LIMB_MOTION_STD_THRESHOLD={val} (normalized)', PASS)
            else:
                record('rules', f'R6-B: LIMB_MOTION_STD_THRESHOLD={val}', FAIL,
                       f'Value {val} looks like pixels, not normalised units!')
    else:
        record('rules', 'R6-B: LIMB_MOTION_STD_THRESHOLD check', SKIP,
               'config/settings.py not found')

    # R6-J — conftest.py exists before test files
    conftest = os.path.join(ROOT, 'backend', 'tests', 'conftest.py')
    if os.path.exists(conftest):
        record('rules', 'R6-J: backend/tests/conftest.py exists', PASS)
    else:
        record('rules', 'R6-J: backend/tests/conftest.py exists', FAIL, 'file missing!')

    # R6-G — snapshot path uses absolute path in events.py
    if events_src:
        if 'os.path.abspath' in events_src or 'os.path.dirname' in events_src:
            record('rules', 'R6-G: snapshot path uses absolute path', PASS)
        else:
            record('rules', 'R6-G: snapshot path uses absolute path', WARN,
                   'os.path.abspath/__file__ not detected — verify manually')


# ═══════════════════════════════════════════════════════════════════════════════
# 6. SCRIPTS VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

def test_scripts():
    section('6. Script Files Validation')

    expected_scripts = [
        'scripts/test_mqtt.py',
        'scripts/verify_cuda.py',
        'scripts/test_camera.py',
        'scripts/latency_test.py',
        'scripts/integration_test.py',
    ]
    for s in expected_scripts:
        full = os.path.join(ROOT, s)
        if os.path.exists(full):
            size = os.path.getsize(full)
            record('scripts', f'{s} exists', PASS, f'{size} bytes')
        else:
            record('scripts', f'{s} exists', FAIL, 'file not found')


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def print_summary():
    section('INTEGRATION TEST SUMMARY')

    categories: dict[str, dict[str, int]] = {}
    for cat, name, outcome in results:
        if cat not in categories:
            categories[cat] = {PASS: 0, FAIL: 0, SKIP: 0, WARN: 0}
        key = outcome if outcome in categories[cat] else WARN
        categories[cat][key] += 1

    total_pass = total_fail = total_skip = total_warn = 0

    print(f'\n  {"Category":<25}  {"PASS":>5}  {"FAIL":>5}  {"WARN":>5}  {"SKIP":>5}')
    print(f'  {"─" * 25}  {"─" * 5}  {"─" * 5}  {"─" * 5}  {"─" * 5}')
    for cat, counts in categories.items():
        p = counts.get(PASS, 0)
        f = counts.get(FAIL, 0)
        w = counts.get(WARN, 0)
        s = counts.get(SKIP, 0)
        total_pass += p; total_fail += f; total_warn += w; total_skip += s
        print(f'  {cat:<25}  {p:5d}  {f:5d}  {w:5d}  {s:5d}')

    print(f'  {"─" * 25}  {"─" * 5}  {"─" * 5}  {"─" * 5}  {"─" * 5}')
    print(f'  {"TOTAL":<25}  {total_pass:5d}  {total_fail:5d}  {total_warn:5d}  {total_skip:5d}')
    print()

    if total_fail == 0:
        print(f'  [PASS] All integration tests passed! '
              f'({total_pass} passed, {total_warn} warnings, {total_skip} skipped)')
    else:
        print(f'  [FAIL] {total_fail} test(s) FAILED. '
              f'{total_pass} passed, {total_warn} warnings.')

    print(f'{"─" * 65}\n')
    return total_fail == 0


def parse_args():
    parser = argparse.ArgumentParser(description='AquaGuard integration test harness')
    parser.add_argument('--verbose', action='store_true',
                        help='Print extra debug information')
    return parser.parse_args()


def main():
    args = parse_args()
    print(f'\n{"=" * 65}')
    print(f'  AquaGuard — Integration Test Suite')
    print(f'  Run at: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'{"=" * 65}')

    test_backend_imports()
    test_detection_engine_imports()
    test_config_files()
    test_api_endpoints()
    test_critical_rules()
    test_scripts()

    ok = print_summary()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
