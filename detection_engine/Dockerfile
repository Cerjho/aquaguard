# ==============================================================================
# AquaGuard Detection Engine — NVIDIA CUDA runtime image
# ==============================================================================
# NOTE: Cannot use alpine or distroless here — PyTorch + CUDA + MediaPipe require
# glibc and the full NVIDIA CUDA runtime libraries. This is the leanest viable
# CUDA base image (runtime, not devel).
# ==============================================================================
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# -- Metadata labels ---------------------------------------------------------
LABEL maintainer="AquaGuard Team" \
      org.opencontainers.image.title="aquaguard-detection" \
      org.opencontainers.image.description="AquaGuard YOLOv11s drowning detection engine (CUDA)" \
      org.opencontainers.image.source="https://github.com/Cerjho/aquaguard"

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

# Merge system package install AND venv creation into a single layer.
# --no-install-recommends + cache cleanup minimize layer size.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        libgl1-mesa-glx \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && python3.11 -m venv "${VIRTUAL_ENV}"

WORKDIR /app

# Copy dependency manifest FIRST for layer cache reuse.
COPY requirements-prod.txt ./requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install --no-cache-dir -r requirements.txt

# Copy application source.
COPY . /app/detection_engine
RUN chmod +x /app/detection_engine/entrypoint.sh || true

ENV PYTHONPATH=/app

# -- Non-root user ------------------------------------------------------------
# Create a dedicated unprivileged user. The snapshots volume must be writable.
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser && \
    mkdir -p /app/backend/snapshots && chown -R appuser:appuser /app

USER appuser

# -- Health check --------------------------------------------------------------
# Lightweight check that the Python runtime and core module are importable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import detection_engine" || exit 1

# Use a small wrapper entrypoint so callers can run arbitrary python commands
# (e.g. `docker run image python -c "..."`) while keeping the default module startup.
ENTRYPOINT ["/bin/bash", "/app/detection_engine/entrypoint.sh"]
CMD ["detection_engine.main"]
