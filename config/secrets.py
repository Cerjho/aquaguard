"""Secret resolution helpers.

Supports direct env vars and *_FILE style secret mounts.
"""

from __future__ import annotations

import os


def get_secret(name: str, *, default: str = "") -> str:
    """Resolve secret from env var or from a mounted file.

    Priority:
    1) NAME env var
    2) NAME_FILE file path env var
    3) default
    """
    value = os.environ.get(name, "").strip()
    if value:
        return value

    file_var = f"{name}_FILE"
    file_path = os.environ.get(file_var, "").strip()
    if not file_path:
        return default

    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return default
