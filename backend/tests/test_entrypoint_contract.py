from pathlib import Path

ENTRYPOINT_PATH = Path(__file__).resolve().parents[1] / "entrypoint.sh"


def _entrypoint_text() -> str:
    return ENTRYPOINT_PATH.read_text(encoding="utf-8")


def test_entrypoint_waits_for_database_before_migrations() -> None:
    content = _entrypoint_text()

    assert "wait_for_database" in content
    assert "run_migrations_with_retry" in content
    assert "wait_for_database\nrun_migrations_with_retry" in content


def test_entrypoint_uses_socketio_run_for_all_environments() -> None:
    """socketio.run() is used instead of gunicorn because gunicorn -k gevent
    is incompatible with SocketIO async_mode='threading'."""
    content = _entrypoint_text()

    assert "exec python wsgi.py" in content
    # gunicorn is intentionally NOT used — see Bug 3 in the environment audit.
    assert "exec gunicorn" not in content


def test_entrypoint_allows_optional_seed_step() -> None:
    content = _entrypoint_text()

    assert "SEED_ON_STARTUP" in content
    assert "Skipping seed.py because SEED_ON_STARTUP is disabled." in content
