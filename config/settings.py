"""AquaGuard system-wide constants and runtime profile helpers."""

import os
from urllib.parse import urlparse

try:
    from utils.env_utils import is_truthy
except ModuleNotFoundError:
    def is_truthy(value: str | None) -> bool:
        """Return True for common truthy string values."""
        return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}

# ── Confidence Filter (Rolling Window) — Water-Level Tuned ────────────────────
CONFIDENCE_WINDOW_SIZE = 10         # N — reduced from 15 (faster response @ water level)
CONFIDENCE_THRESHOLD = 0.70         # T — raised from 0.60 (aggressive FP reduction for on-land scenarios)
CONFIDENCE_MIN_HITS = 6             # K — reduced from 7 (6 of 10 frames high confidence)
CONSECUTIVE_FRAMES_REQUIRED = CONFIDENCE_MIN_HITS
CONSECUTIVE_FRAME_LOW_THRESHOLD = 0.75  # Raised from 0.65 (each frame must score higher to count as hit)

# ── Behavior Analyzer Weights (Water-Level Tuned) ───────────────────────────
# NOTE: Sum = 1.20 (normalized dynamically based on visibility gating)
WEIGHT_VERTICAL_ORIENTATION = 0.30  # Reliable: shoulder landmarks visible
WEIGHT_ARMS_ELEVATED = 0.20         # Reduced from 0.25 (water-level angle affects)
WEIGHT_HEAD_POSITION_LOW = 0.35     # NEW: Most reliable surface cue @ water level
WEIGHT_NO_BREATHING_MOTION = 0.25   # NEW: Temporal signal (breathing pattern absence)
WEIGHT_YOLO_CLASS = 0.10            # Keep: YOLO classification
# REMOVED: WEIGHT_NO_LIMB_MOTION (0.20) — unreliable underwater
# REMOVED: WEIGHT_FACE_SUBMERGED (0.15) — flickers at water line

# ── Behavior Analyzer Thresholds ────────────────────────────────────────────
VERTICAL_ANGLE_THRESHOLD_DEG = 40   # Body angle from vertical (degrees)
# CRITICAL: MediaPipe returns normalized coords [0.0, 1.0] — NOT pixels
LIMB_MOTION_STD_THRESHOLD = 0.025   # Kept for compatibility (no longer used in indicators)
FACE_VISIBILITY_THRESHOLD = 0.5     # Kept for compatibility
YOLO_DROWNING_CONF_BOOST = 0.6      # YOLO confidence threshold for drowning class

# ── Water-Level Detection Thresholds (TIGHTENED for False Positive Reduction) ──
HEAD_LOW_THRESHOLD = 0.08           # TIGHTENED from 0.15 (only triggers when head is nearly at shoulder level, not just looking down)
LIMB_VISIBILITY_MIN_THRESHOLD = 0.30  # Skip indicator if visibility below this
NO_BREATHING_HISTORY_LEN = 5        # Frames to track for breathing pattern detection
NO_BREATHING_HISTORY_FRAMES = 10    # Extended window for no-breathing detection (≥3 required)

# Breathing stability (TUNABLE per pool conditions, increased for strictness)
# Higher value = requires MORE stillness (fewer false positives from standing)
NO_BREATHING_VARIANCE_THRESHOLD = float(os.environ.get("NO_BREATHING_VARIANCE", "0.001"))

# ── Water ROI Gate ────────────────────────────────────────────────────────────
# Polygon defining the pool water surface in FULL FRAME pixel coordinates.
# Persons whose bounding-box base falls outside this polygon are scored 0.0.
# Set to None to disable the gate (all detections scored normally).
WATER_ROI_ENABLED = True
WATER_ROI = None  # Override: list of [x,y] vertices, e.g. [[100,200],[1180,200],[1180,700],[100,700]]

# ── Water ROI Auto-Detection ──────────────────────────────────────────────────
# When WATER_ROI is None and WATER_ROI_ENABLED is True, auto-detect the pool
# water surface from the camera frame using HSV color segmentation.
# Re-detects every startup AND periodically (handles camera repositioning).
WATER_ROI_AUTO_DETECT = True
WATER_ROI_MIN_AREA_RATIO = 0.05     # Min fraction of frame area for valid water region
WATER_ROI_CALIBRATION_FRAMES = 5    # Grab N frames and use the best detection
WATER_ROI_RECALIBRATE_INTERVAL = 300  # Re-detect every N seconds (0 = disable periodic recalibration)
# Fallback ROI: when HSV auto-detection finds no water region, synthesise a polygon
# covering the bottom portion of the frame so the ROI gate is never fully disabled.
WATER_ROI_FALLBACK_ENABLED = is_truthy(os.environ.get("WATER_ROI_FALLBACK_ENABLED", "1"))
WATER_ROI_FALLBACK_TOP_RATIO = float(os.environ.get("WATER_ROI_FALLBACK_TOP_RATIO", "0.30"))  # top edge at 30% → bottom 70% used

# ── YOLO Inference ────────────────────────────────────────────────────────────
YOLO_CONFIDENCE_THRESHOLD = 0.4     # Minimum detection confidence for model.track()
YOLO_IMGSZ = 1280                   # Input resolution (larger = better mid-range detection)
YOLO_MIN_BBOX_AREA = 400            # Min bbox area in px² (only filters person_out_of_water class)

# ── Water-Presence Validation (Camera-Position Independent) ───────────────────
# Layer 1: YOLO hard gate — suppress scoring for "person_out_of_water" detections
SUPPRESS_OUT_OF_WATER_CLASS = True
# When YOLO says person_out_of_water but spatial evidence is ambiguous (person
# appears to be inside the water ROI and no full-body-visible gate fires),
# multiply the final score by this factor instead of hard-zeroing it.
# Set to 0.0 to restore the original hard-suppress behaviour.
PERSON_OOW_AMBIGUOUS_PENALTY = float(os.environ.get("PERSON_OOW_AMBIGUOUS_PENALTY", "0.50"))

# Layer 2: Ankle soft signal — penalize score when full-body standing posture detected
ANKLE_GATE_ENABLED = True
ANKLE_VISIBILITY_MIN = 0.5          # Both ankles must be this visible to trigger
ANKLE_HIP_MARGIN = 0.15             # Ankles must be this far below hips (normalized ROI coords)
ANKLE_OUT_OF_WATER_PENALTY = 0.15   # Score multiplier when person appears on dry land (harsher penalty)

# Pose-absent score cap: when MediaPipe / YOLO-Pose returns no landmarks, only the
# YOLO class indicator is available. Allowing a YOLO-only score of 1.0 to pass the
# confidence filter is too risky. Cap it so YOLO evidence alone can never trigger.
POSE_ABSENT_MAX_SCORE = float(os.environ.get("POSE_ABSENT_MAX_SCORE", "0.50"))

# Layer 3: Full-body-visible hard gate — if full skeleton (knees+ankles) is clearly
# visible, the person is on land (swimmers have submerged lower body)
FULL_BODY_VISIBLE_GATE_ENABLED = True
FULL_BODY_VISIBILITY_MIN = 0.5      # Min visibility for knee+ankle landmarks to trigger gate

# Layer 4: Swimming class upright suppression — if YOLO says "swimming" but body
# is in upright posture, suppress (swimmers are horizontal, not standing)
SWIMMING_UPRIGHT_SUPPRESSION = True
SWIMMING_UPRIGHT_ANGLE_MAX = 35     # Max degrees from vertical to count as "upright"

# ── CUDA / Inference Resiliency ──────────────────────────────────────────────
CUDA_OOM_COOLDOWN_SECONDS = float(os.environ.get('CUDA_OOM_COOLDOWN_SECONDS', '5'))
CUDA_UNKNOWN_ERROR_RESET_SECONDS = float(
    os.environ.get('CUDA_UNKNOWN_ERROR_RESET_SECONDS', '30')
)
# FIX: Increased from 3 to 10 to allow more recovery time for corrupted frames
# (3 was too aggressive and forced restart on isolated H.264 decode errors)
CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE = int(
    os.environ.get('CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE', '10')
)
DETECTION_GPU_MEMORY_FRACTION = float(
    os.environ.get('DETECTION_GPU_MEMORY_FRACTION', '0.75')
)
DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES = int(
    os.environ.get('DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES', '15')
)
DETECTION_GPU_MONITOR_ENABLED = is_truthy(
    os.environ.get('DETECTION_GPU_MONITOR_ENABLED', '1')
)
DETECTION_GPU_MONITOR_INTERVAL_SECONDS = int(
    os.environ.get('DETECTION_GPU_MONITOR_INTERVAL_SECONDS', '30')
)

# ── MQTT ──────────────────────────────────────────────────────────────────────
MQTT_BROKER = os.environ.get(
    'MQTT_BROKER_HOST',
    os.environ.get('MQTT_BROKER', 'localhost'),
)
MQTT_BROKER_HOST = MQTT_BROKER
MQTT_PORT = int(
    os.environ.get(
        'MQTT_BROKER_PORT',
        os.environ.get('MQTT_PORT', '1883'),
    )
)
MQTT_BROKER_PORT = MQTT_PORT
MQTT_ALERT_TOPIC = "aquaguard/alert"
MQTT_TOPIC_ALERT = MQTT_ALERT_TOPIC
MQTT_RESET_TOPIC = "aquaguard/alert/reset"
MQTT_TOPIC_RESET = MQTT_RESET_TOPIC
MQTT_TOPIC_DETECTION = "aquaguard/detection"
MQTT_TOPIC_DEVICE_STATUS = "aquaguard/device/status"
MQTT_TOPIC_CAMERA_HEALTH = "aquaguard/camera/health"
MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS = [1, 2, 4]

# ── Camera Reconnect ──────────────────────────────────────────────────────────
RECONNECT_BACKOFF_SECONDS = [1, 2, 4, 8, 30]
RECONNECT_MAX_CONSECUTIVE_FAILURES = 5

# ── RTSP Stream Settings ──────────────────────────────────────────────────────
RTSP_TRANSPORT = os.environ.get('RTSP_TRANSPORT', 'tcp')  # 'tcp' or 'udp'
RTSP_CONNECT_TIMEOUT_SECONDS = int(os.environ.get('RTSP_CONNECT_TIMEOUT', '10'))
RTSP_READ_TIMEOUT_SECONDS = int(os.environ.get('RTSP_READ_TIMEOUT', '5'))
RTSP_STALL_THRESHOLD_SECONDS = int(os.environ.get('RTSP_STALL_THRESHOLD', '10'))
RTSP_BUFFER_SIZE = int(os.environ.get('RTSP_BUFFER_SIZE', '1'))

# ── Camera Health Monitoring ──────────────────────────────────────────────────
CAMERA_HEALTH_LOG_INTERVAL_SECONDS = 60
CAMERA_FPS_DEGRADED_THRESHOLD = 0.5  # Alert if FPS drops below 50% of target
CAMERA_CORRUPTION_WARN_THRESHOLD = 0.10  # 10% corruption rate triggers warning

# ── Alert ─────────────────────────────────────────────────────────────────────
ALARM_DURATION_SECONDS = 30
ALERT_COOLDOWN_SECONDS = 30         # Per-track cooldown: suppress duplicate alerts within this window

# ── Snapshot ──────────────────────────────────────────────────────────────────
SNAPSHOT_FORMAT = "jpg"
SNAPSHOT_QUALITY = 85

# ── Live feed + heartbeat ─────────────────────────────────────────────────────
LIVE_SNAPSHOT_JPEG_QUALITY = 75
DETECTION_ENGINE_HEARTBEAT_INTERVAL_SECONDS = 5
LIVE_ARTIFACT_REPLACE_RETRIES = 8
LIVE_ARTIFACT_RETRY_DELAY_SECONDS = 0.01


class BaseConfig:
    """Shared Flask defaults."""

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_TOKEN_LOCATION = ['headers', 'cookies']
    JWT_COOKIE_SAMESITE = 'Lax'
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_ACCESS_COOKIE_PATH = '/'
    JWT_REFRESH_COOKIE_PATH = '/api/v1/auth/refresh'
    JWT_CSRF_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
    CORS_ALLOWED_ORIGINS = 'http://localhost:3000'
    RATELIMIT_ENABLED = True


class DevelopmentConfig(BaseConfig):
    APP_ENV = 'development'
    JWT_COOKIE_SECURE = False
    DEBUG = True


class ProductionConfig(BaseConfig):
    APP_ENV = 'production'
    JWT_COOKIE_SECURE = True
    DEBUG = False


def resolve_backend_environment(environ=None):
    """Resolve backend env profile from APP_ENV/FLASK_ENV."""
    source = environ or os.environ
    value = str(source.get('APP_ENV') or source.get('FLASK_ENV') or 'development').strip().lower()
    return 'production' if value == 'production' else 'development'


def get_backend_config(env_name):
    """Return config class for the requested environment."""
    return ProductionConfig if env_name == 'production' else DevelopmentConfig


def _to_bool(value, default=False):
    if value is None:
        return default
    return is_truthy(value)


def _to_int(value, default):
    if value is None or str(value).strip() == '':
        return default
    return int(value)


def _is_sqlite_database(database_url):
    return str(database_url).strip().lower().startswith('sqlite://')


def _parse_cors_origins(raw_origins):
    return [origin.strip() for origin in str(raw_origins).split(',') if origin.strip()]


def _is_localhost_origin(origin):
    hostname = (urlparse(origin).hostname or '').lower()
    return hostname in {'localhost', '127.0.0.1'}


def validate_runtime_settings():
    """Validate cross-module configuration invariants early at startup."""
    if CONFIDENCE_WINDOW_SIZE <= 0:
        raise ValueError('CONFIDENCE_WINDOW_SIZE must be > 0')
    if CONFIDENCE_MIN_HITS <= 0 or CONFIDENCE_MIN_HITS > CONFIDENCE_WINDOW_SIZE:
        raise ValueError('CONFIDENCE_MIN_HITS must be in range 1..CONFIDENCE_WINDOW_SIZE')
    if not 0 < CONFIDENCE_THRESHOLD <= 1:
        raise ValueError('CONFIDENCE_THRESHOLD must be in range (0, 1]')
    if not 0 < CONSECUTIVE_FRAME_LOW_THRESHOLD <= 1:
        raise ValueError('CONSECUTIVE_FRAME_LOW_THRESHOLD must be in range (0, 1]')
    if not 0 <= LIMB_MOTION_STD_THRESHOLD <= 1:
        raise ValueError('LIMB_MOTION_STD_THRESHOLD must be in range [0, 1]')
    if CUDA_OOM_COOLDOWN_SECONDS < 0:
        raise ValueError('CUDA_OOM_COOLDOWN_SECONDS must be >= 0')
    if CUDA_UNKNOWN_ERROR_RESET_SECONDS <= 0:
        raise ValueError('CUDA_UNKNOWN_ERROR_RESET_SECONDS must be > 0')
    if CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE < 1:
        raise ValueError('CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE must be >= 1')
    if not 0 < DETECTION_GPU_MEMORY_FRACTION <= 1:
        raise ValueError('DETECTION_GPU_MEMORY_FRACTION must be in range (0, 1]')
    if DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES < 1:
        raise ValueError(
            'DETECTION_GPU_CACHE_CLEAR_INTERVAL_FRAMES must be >= 1'
        )
    if DETECTION_GPU_MONITOR_INTERVAL_SECONDS < 1:
        raise ValueError(
            'DETECTION_GPU_MONITOR_INTERVAL_SECONDS must be >= 1'
        )
    if RECONNECT_MAX_CONSECUTIVE_FAILURES < 1:
        raise ValueError('RECONNECT_MAX_CONSECUTIVE_FAILURES must be >= 1')
    if not RECONNECT_BACKOFF_SECONDS or any(delay <= 0 for delay in RECONNECT_BACKOFF_SECONDS):
        raise ValueError('RECONNECT_BACKOFF_SECONDS must contain positive values')
    if not str(MQTT_BROKER_HOST).strip():
        raise ValueError('MQTT_BROKER_HOST must not be empty')
    if MQTT_BROKER_PORT < 1 or MQTT_BROKER_PORT > 65535:
        raise ValueError('MQTT_BROKER_PORT must be in range 1..65535')
    if (
        not MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS
        or any(delay <= 0 for delay in MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS)
    ):
        raise ValueError(
            'MQTT_STARTUP_CONNECT_RETRY_DELAYS_SECONDS must contain positive values'
        )
    if RTSP_TRANSPORT not in ('tcp', 'udp'):
        raise ValueError('RTSP_TRANSPORT must be "tcp" or "udp"')
    if RTSP_CONNECT_TIMEOUT_SECONDS < 1:
        raise ValueError('RTSP_CONNECT_TIMEOUT_SECONDS must be >= 1')
    if RTSP_READ_TIMEOUT_SECONDS < 1:
        raise ValueError('RTSP_READ_TIMEOUT_SECONDS must be >= 1')
    if RTSP_STALL_THRESHOLD_SECONDS < 1:
        raise ValueError('RTSP_STALL_THRESHOLD_SECONDS must be >= 1')

    env_name = resolve_backend_environment()
    if env_name == 'production':
        database_url = str(os.getenv('DATABASE_URL', '')).strip()
        if not database_url:
            raise ValueError('DATABASE_URL is required in production')
        if _is_sqlite_database(database_url):
            raise ValueError('DATABASE_URL must not use sqlite in production')

        cors_allowed_origins = str(os.getenv('CORS_ALLOWED_ORIGINS', '')).strip()
        if not cors_allowed_origins:
            raise ValueError('CORS_ALLOWED_ORIGINS is required in production')

        origins = _parse_cors_origins(cors_allowed_origins)
        if not origins:
            raise ValueError('CORS_ALLOWED_ORIGINS is required in production')
        if any(_is_localhost_origin(origin) for origin in origins):
            raise ValueError(
                'CORS_ALLOWED_ORIGINS must not include localhost in production'
            )

    rate_limit_storage = str(
        os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
    ).strip().lower()
    if env_name == 'production' and rate_limit_storage.startswith('memory://'):
        raise ValueError(
            'RATELIMIT_STORAGE_URI must not use memory:// in production'
        )


def build_backend_runtime_values(environ=None):
    """Build environment-sensitive runtime values for Flask app config."""
    source = environ or os.environ
    env_name = resolve_backend_environment(source)
    config_cls = get_backend_config(env_name)

    return {
        'APP_ENV': env_name,
        'JWT_COOKIE_SECURE': _to_bool(
            source.get('JWT_COOKIE_SECURE'),
            config_cls.JWT_COOKIE_SECURE,
        ),
        'JWT_COOKIE_SAMESITE': source.get(
            'JWT_COOKIE_SAMESITE',
            config_cls.JWT_COOKIE_SAMESITE,
        ),
        'JWT_COOKIE_CSRF_PROTECT': _to_bool(
            source.get('JWT_COOKIE_CSRF_PROTECT'),
            config_cls.JWT_COOKIE_CSRF_PROTECT,
        ),
        'RATELIMIT_ENABLED': _to_bool(
            source.get('RATELIMIT_ENABLED'),
            config_cls.RATELIMIT_ENABLED,
        ),
        'CORS_ALLOWED_ORIGINS': source.get(
            'CORS_ALLOWED_ORIGINS',
            config_cls.CORS_ALLOWED_ORIGINS,
        ),
        'WEBRTC_SESSION_TTL_SECONDS': _to_int(source.get('WEBRTC_SESSION_TTL_SECONDS'), 300),
        'WEBRTC_STUN_URLS': source.get('WEBRTC_STUN_URLS', 'stun:stun.l.google.com:19302'),
        'WEBRTC_TURN_URL': source.get('WEBRTC_TURN_URL'),
        'WEBRTC_TURN_USERNAME': source.get('WEBRTC_TURN_USERNAME'),
        'WEBRTC_TURN_CREDENTIAL': source.get('WEBRTC_TURN_CREDENTIAL')
        or source.get('WEBRTC_TURN_PASSWORD'),
        'WEBRTC_ICE_TRANSPORT_POLICY': source.get('WEBRTC_ICE_TRANSPORT_POLICY', 'all'),
        'WEBRTC_FORCE_RELAY': _to_bool(source.get('WEBRTC_FORCE_RELAY'), False),
        'WEBRTC_FUTURE_TIMEOUT_SECONDS': _to_int(source.get('WEBRTC_FUTURE_TIMEOUT_SECONDS'), 20),
        'WEBRTC_ICE_GATHERING_TIMEOUT_SECONDS': _to_int(
            source.get('WEBRTC_ICE_GATHERING_TIMEOUT_SECONDS'),
            3,
        ),
    }
