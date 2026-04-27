from flask import Blueprint, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Counter, Gauge
import time
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
