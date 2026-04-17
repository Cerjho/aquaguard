#!/usr/bin/env bash
# AquaGuard - Start container stack for demo/deployment (Linux/macOS)
# Run from repo root: bash scripts/start_stack.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.yml"
ENV_FILE="$ROOT/.env"
ENV_EXAMPLE_FILE="$ROOT/.env.example"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"
NO_BUILD="${NO_BUILD:-0}"

step() {
  echo "==> $1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: $1"
    exit 1
  fi
}

wait_http_endpoint() {
  local timeout="$1"
  shift
  local expected_codes_csv="$1"
  shift

  local expected_codes=()
  IFS=',' read -r -a expected_codes <<< "$expected_codes_csv"

  local start_time
  start_time="$(date +%s)"

  while true; do
    for url in "$@"; do
      local status
      status="$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "$url" || true)"
      for expected_status in "${expected_codes[@]}"; do
        if [[ "$status" == "$expected_status" ]]; then
          echo "$url"
          return 0
        fi
      done
    done

    local now
    now="$(date +%s)"
    if (( now - start_time >= timeout )); then
      return 1
    fi

    sleep 2
  done
}

step "AquaGuard container bootstrap starting"

require_command docker
require_command curl

docker info >/dev/null 2>&1 || {
  echo "ERROR: Docker daemon is not reachable. Start Docker and retry."
  exit 1
}

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: Compose file not found: $COMPOSE_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    echo "WARNING: Created .env from .env.example. Review secrets before production use."
  else
    echo "ERROR: .env and .env.example are both missing. Cannot continue."
    exit 1
  fi
fi

compose_args=(compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d)
if [[ "$NO_BUILD" != "1" ]]; then
  compose_args+=(--build)
fi

step "Starting Docker Compose services"
docker "${compose_args[@]}"

step "Waiting for backend readiness"
if ! backend_url="$(wait_http_endpoint "$TIMEOUT_SECONDS" \
  "200,401,403" \
  "http://localhost:5000/api/health" \
  "http://localhost:5000/api/v1/system/status")"; then
  echo "ERROR: Backend readiness check timed out after ${TIMEOUT_SECONDS}s"
  exit 1
fi
echo "Backend is reachable via: $backend_url"

step "Waiting for frontend readiness"
if ! frontend_url="$(wait_http_endpoint "$TIMEOUT_SECONDS" "200" "http://localhost:3000")"; then
  echo "ERROR: Frontend readiness check timed out after ${TIMEOUT_SECONDS}s"
  exit 1
fi
if [[ "$frontend_url" != "http://localhost:3000" ]]; then
  echo "ERROR: Frontend readiness probe returned unexpected URL: $frontend_url"
  exit 1
fi
echo "Frontend is reachable via: $frontend_url"

step "Current compose service status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo
echo "AquaGuard stack is up."
echo "To stream logs: docker compose logs -f backend frontend detection_engine"
echo "To stop:        docker compose down"
