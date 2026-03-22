import tempfile

from config.secrets import get_secret
from config.settings import build_backend_runtime_values, resolve_backend_environment


def test_get_secret_prefers_direct_env(monkeypatch):
    monkeypatch.setenv("TEST_SECRET", "direct-value")
    monkeypatch.setenv("TEST_SECRET_FILE", "")

    assert get_secret("TEST_SECRET") == "direct-value"


def test_get_secret_uses_file_env(monkeypatch):
    with tempfile.NamedTemporaryFile(mode="w", delete=False, encoding="utf-8") as handle:
        handle.write("file-secret-value\n")
        secret_path = handle.name

    monkeypatch.delenv("TEST_SECRET", raising=False)
    monkeypatch.setenv("TEST_SECRET_FILE", secret_path)

    assert get_secret("TEST_SECRET") == "file-secret-value"


def test_get_secret_returns_default_for_missing_file(monkeypatch):
    monkeypatch.delenv("TEST_SECRET", raising=False)
    monkeypatch.setenv("TEST_SECRET_FILE", "missing-secret-file.txt")

    assert get_secret("TEST_SECRET", default="fallback") == "fallback"


def test_resolve_backend_environment_defaults_to_development(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("FLASK_ENV", raising=False)

    assert resolve_backend_environment() == "development"


def test_build_backend_runtime_values_sets_production_defaults(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("JWT_COOKIE_SECURE", raising=False)

    values = build_backend_runtime_values()

    assert values["APP_ENV"] == "production"
    assert values["JWT_COOKIE_SECURE"] is True
