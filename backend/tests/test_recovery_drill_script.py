from pathlib import Path
import subprocess
import sys

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "recovery_drill.py"


def test_recovery_drill_help_runs() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "--services" in result.stdout


def test_recovery_drill_dry_run_mode() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--dry-run",
            "--services",
            "backend",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "DRY RUN mode enabled" in result.stdout
    assert "RECOVERY DRILL PASSED" in result.stdout
