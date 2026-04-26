# ==============================================================================
# Stage 1: Builder — install Python dependencies into an isolated prefix
# ==============================================================================
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Copy dependency manifest FIRST for maximum layer cache reuse.
# Source code changes will NOT invalidate this expensive layer.
COPY backend/requirements-prod.txt ./requirements.txt

# Install into --prefix so we can cherry-pick the result into the runtime stage
# without dragging along pip, setuptools, or wheel.
RUN python -m pip install --upgrade pip && \
    python -m pip install --no-cache-dir --prefix=/install -r requirements.txt

# ==============================================================================
# Stage 2: Runtime — lean production image
# ==============================================================================
FROM python:3.11-slim

# -- Metadata labels ---------------------------------------------------------
LABEL maintainer="AquaGuard Team" \
      org.opencontainers.image.title="aquaguard-backend" \
      org.opencontainers.image.description="AquaGuard Flask REST API and WebSocket backend" \
      org.opencontainers.image.source="https://github.com/Cerjho/aquaguard"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy only the installed packages from the builder — no pip, no wheel, no build tools.
COPY --from=builder /install/lib /usr/local/lib
COPY --from=builder /install/bin /usr/local/bin

# Copy application source code.
COPY backend/ ./
COPY config/ ./config/

# Fix CRLF line-endings and set executable permission in the build, not at runtime.
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# -- Non-root user ------------------------------------------------------------
# Create a dedicated unprivileged user. The snapshots volume is writable by this user.
# Install curl for lightweight health checks.
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser && \
    mkdir -p /app/snapshots && chown -R appuser:appuser /app

USER appuser

# -- Health check --------------------------------------------------------------
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

EXPOSE 5000

ENTRYPOINT ["bash", "entrypoint.sh"]
