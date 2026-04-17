#!/usr/bin/env python3
"""AquaGuard recovery drill harness.

Runs controlled service restarts and verifies recovery with the defense smoke flow.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib import error, request

DEFAULT_SERVICES = ["mosquitto", "backend", "detection_engine"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run AquaGuard recovery drills")
    parser.add_argument("--base-url", default="http://localhost:5000")
    parser.add_argument("--frontend-url", default="http://localhost:3000")
    parser.add_argument("--services", nargs="+", default=DEFAULT_SERVICES)
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--output-json", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def run_command(command: list[str], dry_run: bool) -> None:
    print("$ " + " ".join(command))
    if dry_run:
        return
    subprocess.run(command, check=True)


def wait_for_url(url: str, timeout_seconds: int, expected_statuses: set[int]) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with request.urlopen(url, timeout=4) as response:
                if response.status in expected_statuses:
                    return
        except error.HTTPError as exc:
            if exc.code in expected_statuses:
                return
        except error.URLError:
            pass
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {url}")


def run_defense_smoke(base_url: str, dry_run: bool) -> None:
    command = [
        sys.executable,
        str(Path(__file__).resolve().parent / "defense_smoke.py"),
        "--base-url",
        base_url,
    ]
    print("$ " + " ".join(command))
    if dry_run:
        return
    subprocess.run(command, check=True)


def verify_recovery(
    base_url: str,
    frontend_url: str,
    timeout_seconds: int,
    service: str,
    dry_run: bool,
) -> None:
    if dry_run:
        return

    wait_for_url(f"{base_url.rstrip('/')}/api/health", timeout_seconds, {200})
    if service == "frontend":
        wait_for_url(frontend_url.rstrip("/"), timeout_seconds, {200})
    run_defense_smoke(base_url, dry_run=False)


def run_drill(args: argparse.Namespace) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    run_command(["docker", "compose", "version"], args.dry_run)
    for service in args.services:
        started = time.time()
        print(f"[drill] restarting service: {service}")
        run_command(["docker", "compose", "restart", service], args.dry_run)
        verify_recovery(
            base_url=args.base_url,
            frontend_url=args.frontend_url,
            timeout_seconds=max(args.timeout_seconds, 1),
            service=service,
            dry_run=args.dry_run,
        )
        elapsed_seconds = round(time.time() - started, 2)
        results.append({"service": service, "recovery_seconds": elapsed_seconds})
        print(f"[drill] {service} recovered in {elapsed_seconds}s")
    return results


def main() -> int:
    args = parse_args()
    print("AquaGuard recovery drill starting")
    if args.dry_run:
        print("DRY RUN mode enabled")

    try:
        results = run_drill(args)
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"RECOVERY DRILL FAILED: {exc}")
        return 1

    if args.output_json:
        Path(args.output_json).write_text(
            json.dumps({"results": results}, indent=2),
            encoding="utf-8",
        )

    print("RECOVERY DRILL PASSED")
    print(json.dumps({"results": results}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
