r"""Simple API load probe for AquaGuard performance tracking.

Usage:
    .\aquaguard_env\Scripts\python scripts\load_test.py \
        --url http://127.0.0.1:5000/health --requests 200 --concurrency 20
"""

import argparse
import json
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests


def _single_request(url: str, timeout: float) -> tuple[bool, float]:
    started = time.perf_counter()
    try:
        response = requests.get(url, timeout=timeout)
        ok = 200 <= response.status_code < 500
    except requests.RequestException:
        ok = False
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return ok, elapsed_ms


def run_load(url: str, total_requests: int, concurrency: int, timeout: float):
    latencies = []
    failures = 0
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=max(concurrency, 1)) as pool:
        futures = [pool.submit(_single_request, url, timeout) for _ in range(total_requests)]
        for future in as_completed(futures):
            ok, latency_ms = future.result()
            with lock:
                latencies.append(latency_ms)
                if not ok:
                    failures += 1

    latencies.sort()
    p50 = statistics.median(latencies) if latencies else 0.0
    p95_idx = int(max(len(latencies) - 1, 0) * 0.95)
    p95 = latencies[p95_idx] if latencies else 0.0
    return {
        "requests": total_requests,
        "concurrency": concurrency,
        "failures": failures,
        "success_rate": (
            0.0
            if total_requests == 0
            else ((total_requests - failures) / total_requests) * 100.0
        ),
        "latency_ms_avg": statistics.mean(latencies) if latencies else 0.0,
        "latency_ms_p50": p50,
        "latency_ms_p95": p95,
        "latency_ms_max": max(latencies) if latencies else 0.0,
    }


def run_rounds(url: str, total_requests: int, concurrency: int, timeout: float, rounds: int):
    series = []
    for index in range(max(rounds, 1)):
        item = run_load(url, total_requests, concurrency, timeout)
        item["round"] = index + 1
        series.append(item)

    avg_success = statistics.mean(item["success_rate"] for item in series)
    avg_p95 = statistics.mean(item["latency_ms_p95"] for item in series)
    return {
        "rounds": series,
        "aggregate": {
            "round_count": len(series),
            "avg_success_rate": avg_success,
            "avg_latency_ms_p95": avg_p95,
            "max_latency_ms_p95": max(item["latency_ms_p95"] for item in series),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run a lightweight API load probe")
    parser.add_argument(
        "--url",
        required=True,
        help="Target URL (example: http://127.0.0.1:5000/api/v1/system/status)",
    )
    parser.add_argument("--requests", type=int, default=100, help="Total request count")
    parser.add_argument("--concurrency", type=int, default=10, help="Concurrent workers")
    parser.add_argument("--timeout", type=float, default=3.0, help="Per-request timeout seconds")
    parser.add_argument("--rounds", type=int, default=1, help="How many rounds to execute")
    parser.add_argument("--output", default="", help="Optional JSON output path")
    args = parser.parse_args()

    summary = run_rounds(args.url, args.requests, args.concurrency, args.timeout, args.rounds)
    print("AquaGuard load probe summary")
    aggregate = summary["aggregate"]
    print(f"- rounds: {aggregate['round_count']}")
    print(f"- avg_success_rate: {aggregate['avg_success_rate']:.2f}")
    print(f"- avg_latency_ms_p95: {aggregate['avg_latency_ms_p95']:.2f}")
    print(f"- max_latency_ms_p95: {aggregate['max_latency_ms_p95']:.2f}")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2)
        print(f"- output_written: {args.output}")


if __name__ == "__main__":
    main()
