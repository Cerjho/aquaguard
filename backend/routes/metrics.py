from flask import Blueprint, Response

# prometheus_client is optional in CI environments; provide a safe fallback
try:
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Gauge
except Exception:  # pragma: no cover - fallback for CI/runtime without prometheus
    def generate_latest() -> bytes:
        return b""

    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"

    class Gauge:  # minimal no-op Gauge replacement
        def __init__(self, *args, **kwargs):
            pass

        def set(self, *args, **kwargs):
            return None

        def inc(self, *args, **kwargs):
            return None

        def dec(self, *args, **kwargs):
            return None

from extensions import limiter

metrics_bp = Blueprint('metrics', __name__)

# We can define application-specific metrics here.
# prometheus_client automatically exports process metrics (CPU, memory, FDs, GC).
WEBRTC_SESSIONS_ACTIVE = Gauge(
    'aquaguard_webrtc_sessions_active',
    'Number of active WebRTC sessions'
)


@metrics_bp.route('/metrics')
@limiter.exempt
def metrics():
    """Prometheus metrics scraping endpoint."""
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
