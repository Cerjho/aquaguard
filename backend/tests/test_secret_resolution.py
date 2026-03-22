import tempfile

from config.secrets import get_secret


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
