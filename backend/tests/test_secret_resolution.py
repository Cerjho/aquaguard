import tempfile
import pytest

from config.secrets import get_secret
from config.settings import (
    build_backend_runtime_values,
    resolve_backend_environment,
    validate_runtime_settings,
)


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


def test_validate_runtime_settings_rejects_sqlite_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///aquaguard.db")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://dashboard.example.com")
    monkeypatch.setenv("RATELIMIT_STORAGE_URI", "redis://redis:6379/1")

    with pytest.raises(ValueError, match="DATABASE_URL must not use sqlite"):
        validate_runtime_settings()


def test_validate_runtime_settings_requires_cors_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:pass@db:3306/aquaguard")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "")
    monkeypatch.setenv("RATELIMIT_STORAGE_URI", "redis://redis:6379/1")

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS is required"):
        validate_runtime_settings()


def test_validate_runtime_settings_rejects_localhost_cors_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:pass@db:3306/aquaguard")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("RATELIMIT_STORAGE_URI", "redis://redis:6379/1")

    with pytest.raises(ValueError, match="must not include localhost"):
        validate_runtime_settings()


def test_validate_runtime_settings_rejects_memory_rate_limit_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:pass@db:3306/aquaguard")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://dashboard.example.com")
    monkeypatch.setenv("RATELIMIT_STORAGE_URI", "memory://")

    with pytest.raises(ValueError, match="RATELIMIT_STORAGE_URI"):
        validate_runtime_settings()


def test_validate_runtime_settings_accepts_valid_production_configuration(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:pass@db:3306/aquaguard")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://dashboard.example.com")
    monkeypatch.setenv("RATELIMIT_STORAGE_URI", "redis://redis:6379/1")

    validate_runtime_settings()
