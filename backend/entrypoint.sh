#!/usr/bin/env bash
# Backend container entrypoint.
# Waits for DB readiness, runs migrations with retry, then starts the backend.
set -euo pipefail

export FLASK_APP=wsgi.py

is_truthy() {
	local value="${1:-}"
	value="${value,,}"
	[[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

wait_for_database() {
	if [[ -z "${DATABASE_URL:-}" ]]; then
		echo "ERROR: DATABASE_URL must be set before backend startup."
		return 1
	fi

	local retries="${DB_READY_RETRIES:-30}"
	local delay_seconds="${DB_READY_DELAY_SECONDS:-2}"
	local attempt=1

	while (( attempt <= retries )); do
		if python - <<'PY'
import os
import sys

from sqlalchemy import create_engine, text

database_url = os.getenv("DATABASE_URL")
if not database_url:
		sys.exit(1)

try:
		engine = create_engine(database_url, pool_pre_ping=True)
		with engine.connect() as connection:
				connection.execute(text("SELECT 1"))
except Exception:
		sys.exit(1)

sys.exit(0)
PY
		then
			echo "==> Database is reachable."
			return 0
		fi

		if (( attempt == retries )); then
			break
		fi

		echo "==> Database not ready (attempt ${attempt}/${retries}); retrying in ${delay_seconds}s..."
		sleep "${delay_seconds}"
		attempt=$((attempt + 1))
	done

	echo "ERROR: Database did not become reachable after ${retries} attempts."
	return 1
}

run_migrations_with_retry() {
	local retries="${DB_MIGRATION_RETRIES:-5}"
	local delay_seconds="${DB_MIGRATION_DELAY_SECONDS:-3}"
	local attempt=1

	while (( attempt <= retries )); do
		echo "==> Running database migrations (attempt ${attempt}/${retries})..."
		if AQUAGUARD_SKIP_STARTUP_BOOTSTRAP=1 python -m flask db upgrade; then
			echo "==> Database migrations completed."
			return 0
		fi

		if (( attempt == retries )); then
			break
		fi

		echo "==> Migration failed; retrying in ${delay_seconds}s..."
		sleep "${delay_seconds}"
		attempt=$((attempt + 1))
	done

	echo "ERROR: Database migrations failed after ${retries} attempts."
	return 1
}

wait_for_database
run_migrations_with_retry

if is_truthy "${SEED_ON_STARTUP:-true}"; then
	echo "==> Seeding default users and camera zones..."
	python seed.py
else
	echo "==> Skipping seed.py because SEED_ON_STARTUP is disabled."
fi

echo "==> Starting AquaGuard backend..."
if [[ "${FLASK_ENV:-development}" == "production" ]]; then
	exec gunicorn \
		-k gevent \
		-w "${GUNICORN_WORKERS:-1}" \
		-b "0.0.0.0:${PORT:-5000}" \
		wsgi:app
fi

export ALLOW_UNSAFE_WERKZEUG="${ALLOW_UNSAFE_WERKZEUG:-1}"
exec python wsgi.py
