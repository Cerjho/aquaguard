#!/usr/bin/env bash
# AquaGuard - Start all development services (Linux/macOS)
# Run from repo root: bash scripts/start_dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_MQTT="${SKIP_MQTT:-0}"
SKIP_TURN="${SKIP_TURN:-0}"
SKIP_FRONTEND="${SKIP_FRONTEND:-0}"

cd "$ROOT"

echo "==> AquaGuard Dev Environment Starting..."

if [[ "$SKIP_MQTT" != "1" ]]; then
  echo "==> Starting Mosquitto via docker compose..."
  docker compose up -d mosquitto
fi

if [[ "$SKIP_TURN" != "1" ]]; then
  echo "==> Starting coturn via docker compose..."
  docker compose up -d coturn
fi

echo "==> Starting backend via docker compose..."
docker compose up -d backend

if [[ "$SKIP_FRONTEND" != "1" ]]; then
  echo "==> Starting frontend via docker compose..."
  docker compose up -d frontend
fi

echo ""
echo "Services are starting. Useful commands:"
echo "  docker compose ps"
echo "  docker compose logs -f backend"
echo "  docker compose logs -f coturn"
echo ""
echo "To stop all: docker compose down"
