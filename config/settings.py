"""AquaGuard system-wide constants and runtime profile helpers."""

import os
from urllib.parse import urlparse

# ── Confidence Filter (Rolling Window) ────────────────────────────────────────
CONFIDENCE_WINDOW_SIZE = 15         # N — rolling window size
CONFIDENCE_THRESHOLD = 0.75         # T — mean ratio threshold to trigger alert
CONFIDENCE_MIN_HITS = 10            # K — minimum positive frames in window
CONSECUTIVE_FRAMES_REQUIRED = CONFIDENCE_MIN_HITS
CONSECUTIVE_FRAME_LOW_THRESHOLD = 0.65

# ── Behavior Analyzer Weights ─────────────────────────────────────────────────
WEIGHT_VERTICAL_ORIENTATION = 0.30
WEIGHT_ARMS_ELEVATED = 0.25
WEIGHT_NO_LIMB_MOTION = 0.20
WEIGHT_FACE_SUBMERGED = 0.15
WEIGHT_YOLO_CLASS = 0.10

# ── Behavior Analyzer Thresholds ─────────────────────────────────────────────
VERTICAL_ANGLE_THRESHOLD_DEG = 30
# CRITICAL: MediaPipe returns normalized coords [0.0, 1.0] — NOT pixels
LIMB_MOTION_STD_THRESHOLD = 0.015
FACE_VISIBILITY_THRESHOLD = 0.4
YOLO_DROWNING_CONF_BOOST = 0.6

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
ALERT_RETRIGGER_INTERVAL_SECONDS = float(
    os.environ.get('ALERT_RETRIGGER_INTERVAL_SECONDS', '2.0')
)

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
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


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
