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

# ── 1. Bootstrap backend/.env from .env.example if it doesn't exist ──────────
if [[ ! -f "$ROOT/backend/.env" ]]; then
  if [[ -f "$ROOT/backend/.env.example" ]]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    echo "==> Created backend/.env from backend/.env.example"
    echo "    IMPORTANT: Review and update backend/.env with your own secrets."
  else
    echo "WARNING: backend/.env not found and backend/.env.example is missing."
    echo "         The backend requires SECRET_KEY and JWT_SECRET_KEY to start."
  fi
else
  echo "==> backend/.env already exists (skipping copy from example)."
fi

# ── 2. Bootstrap frontend/.env if it doesn't exist ───────────────────────────
if [[ ! -f "$ROOT/frontend/.env" ]]; then
  cat > "$ROOT/frontend/.env" <<'EOF'
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
EOF
  echo "==> Created frontend/.env with default API URL settings."
fi

if [[ "$SKIP_MQTT" != "1" ]]; then
  echo "==> Starting Mosquitto via docker compose..."
  docker compose up -d mosquitto
fi

if [[ "$SKIP_TURN" != "1" ]]; then
  echo "==> Starting coturn via docker compose..."
  docker compose up -d coturn
fi

echo "==> Starting backend via docker compose..."
echo "    (entrypoint will run 'flask db upgrade' and 'python seed.py' automatically)"
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
