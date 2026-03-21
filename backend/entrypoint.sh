#!/usr/bin/env bash
# Backend container entrypoint.
# Runs DB migrations and seeds default data, then starts the Flask/SocketIO server.
set -euo pipefail

export FLASK_APP=wsgi.py

echo "==> Running database migrations..."
python -m flask db upgrade

echo "==> Seeding default users and camera zones..."
python seed.py

echo "==> Starting AquaGuard backend..."
exec python wsgi.py
