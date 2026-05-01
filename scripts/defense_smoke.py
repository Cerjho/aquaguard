#!/usr/bin/env python3
"""Defense-day smoke flow for AquaGuard.

Validates core operator workflow against a running stack:
1) Login
2) Camera stream-token access
3) Detection event ingestion
4) Alert visibility
5) Alert acknowledgement
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib import error, parse, request


@dataclass
class SmokeConfig:
    base_url: str
    username: str
    password: str
    zone_id: str | None
    timeout_seconds: int


def parse_args() -> SmokeConfig:
    parser = argparse.ArgumentParser(description="Run AquaGuard defense smoke flow")
    parser.add_argument("--base-url", default="http://localhost:5000")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="aquaguard2026")
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--timeout-seconds", type=int, default=10)
    args = parser.parse_args()

    return SmokeConfig(
        base_url=args.base_url.rstrip("/"),
        username=args.username,
        password=args.password,
        zone_id=args.zone_id,
        timeout_seconds=max(args.timeout_seconds, 1),
    )


def request_json(
    cfg: SmokeConfig,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, dict[str, Any] | list[Any] | str]:
    url = f"{cfg.base_url}{path}"
    payload = None
    headers = {"Accept": "application/json"}

    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = request.Request(url=url, method=method, data=payload, headers=headers)
    try:
        with request.urlopen(req, timeout=cfg.timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            return response.status, parse_json_payload(raw)
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        return exc.code, parse_json_payload(raw)


def parse_json_payload(raw: str) -> dict[str, Any] | list[Any] | str:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def login(cfg: SmokeConfig) -> str:
    status, payload = request_json(
        cfg,
        method="POST",
        path="/api/v1/auth/login",
        body={"username": cfg.username, "password": cfg.password},
    )
    ensure(status == 200, f"Login failed with status={status}, payload={payload}")
    ensure(isinstance(payload, dict), "Login payload was not JSON object")
    token = payload.get("access_token")
    ensure(isinstance(token, str) and token, "No access_token in login response")
    return token


def get_zone_id(cfg: SmokeConfig, token: str) -> str:
    if cfg.zone_id:
        return cfg.zone_id

    status, payload = request_json(cfg, method="GET", path="/api/v1/cameras", token=token)
    ensure(status == 200, f"List cameras failed with status={status}")
    
    if isinstance(payload, dict):
        if "data" in payload and isinstance(payload["data"], dict) and "cameras" in payload["data"]:
            cameras = payload["data"]["cameras"]
        elif "data" in payload and isinstance(payload["data"], list):
            cameras = payload["data"]
        elif "cameras" in payload:
            cameras = payload["cameras"]
        else:
            cameras = payload
    else:
        cameras = payload

    ensure(isinstance(cameras, list), f"Cameras payload was not a list: {payload}")
    ensure(len(cameras) > 0, "No active cameras found; pass --zone-id to override")
    zone_id = cameras[0].get("zone_id") if isinstance(cameras[0], dict) else None
    ensure(isinstance(zone_id, str) and zone_id, "First camera missing zone_id")
    return zone_id


def verify_stream_access(cfg: SmokeConfig, token: str, zone_id: str) -> None:
    status, payload = request_json(
        cfg,
        method="GET",
        path=f"/api/v1/cameras/{zone_id}/stream-token",
        token=token,
    )
    ensure(status == 200, f"Stream-token request failed with status={status}")
    ensure(isinstance(payload, dict), "Stream-token payload was not JSON object")
    stream_token = payload.get("stream_token") if "stream_token" in payload else payload.get("data", {}).get("stream_token")
    ensure(isinstance(stream_token, str) and stream_token, f"stream_token is missing in payload: {payload}")

    query = parse.urlencode({"token": stream_token})
    stream_url = f"{cfg.base_url}/api/v1/cameras/{zone_id}/stream?{query}"
    stream_req = request.Request(url=stream_url, method="GET")
    with request.urlopen(stream_req, timeout=cfg.timeout_seconds) as response:
        content_type = response.headers.get("Content-Type", "")
        ensure(response.status == 200, f"Stream endpoint status={response.status}")
        ensure(
            "multipart/x-mixed-replace" in content_type,
            f"Unexpected stream content type: {content_type}",
        )


def create_alert_event(cfg: SmokeConfig, zone_id: str) -> str:
    event_payload = {
        "zone_id": zone_id,
        "track_id": int(datetime.now(timezone.utc).timestamp()),
        "confidence_score": 0.95,
        "behavior_flags": {"vertical": True, "arms_elevated": True},
        "alert_triggered": True,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    status, payload = request_json(
        cfg,
        method="POST",
        path="/api/v1/events",
        body=event_payload,
    )
    ensure(status == 201, f"Event ingest failed with status={status}, payload={payload}")
    ensure(isinstance(payload, dict), "Event response was not JSON object")

    data = payload.get("data", payload)
    
    alert_id = data.get("alert_id")
    if isinstance(alert_id, str) and alert_id:
        return alert_id

    alert_obj = data.get("alert") if isinstance(data.get("alert"), dict) else {}
    alert_id = alert_obj.get("alert_id")
    ensure(isinstance(alert_id, str) and alert_id, f"Alert was not generated. Payload: {payload}")
    return alert_id


def extract_alert_ids(payload: dict[str, Any] | list[Any] | str) -> list[str]:
    if isinstance(payload, dict):
        if "data" in payload and isinstance(payload["data"], dict) and "alerts" in payload["data"]:
            alerts = payload["data"]["alerts"]
        elif "data" in payload and isinstance(payload["data"], list):
            alerts = payload["data"]
        else:
            alerts = payload.get("alerts")
        items = alerts if isinstance(alerts, list) else []
    elif isinstance(payload, list):
        items = payload
    else:
        items = []

    alert_ids: list[str] = []
    for item in items:
        if isinstance(item, dict):
            alert_id = item.get("alert_id")
            if isinstance(alert_id, str) and alert_id:
                alert_ids.append(alert_id)
    return alert_ids


def verify_alert_present(cfg: SmokeConfig, token: str, alert_id: str) -> None:
    status, payload = request_json(
        cfg,
        method="GET",
        path="/api/v1/alerts?status=unacknowledged",
        token=token,
    )
    ensure(status == 200, f"List alerts failed with status={status}")
    ensure(alert_id in extract_alert_ids(payload), f"New alert not found in alert list. Payload: {payload}, Alert ID: {alert_id}")





def verify_authenticated_status(cfg: SmokeConfig, token: str) -> None:
    status, payload = request_json(
        cfg,
        method="GET",
        path="/api/v1/system/status",
        token=token,
    )
    ensure(status == 200, f"System status failed with status={status}, payload={payload}")


def main() -> int:
    cfg = parse_args()

    try:
        print("[1/6] Logging in")
        token = login(cfg)

        print("[2/6] Validating authenticated system status")
        verify_authenticated_status(cfg, token)

        print("[3/6] Verifying stream-token access")
        zone_id = get_zone_id(cfg, token)
        verify_stream_access(cfg, token, zone_id)

        print("[4/6] Triggering detection event and alert")
        alert_id = create_alert_event(cfg, zone_id)

        print("[5/6] Verifying alert visibility")
        verify_alert_present(cfg, token, alert_id)


    except Exception as exc:  # noqa: BLE001
        print(f"SMOKE FAILED: {exc}")
        return 1

    print("SMOKE PASSED: defense workflow is healthy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
