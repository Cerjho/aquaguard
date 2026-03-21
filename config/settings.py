# AquaGuard system-wide constants and thresholds
# All values come from this file — never hardcode in application code

# ── Confidence Filter (Rolling Window) ────────────────────────────────────────
CONFIDENCE_WINDOW_SIZE = 15         # N — rolling window size
CONFIDENCE_THRESHOLD = 0.75         # T — mean ratio threshold to trigger alert
CONFIDENCE_MIN_HITS = 10            # K — minimum positive frames in window
CONSECUTIVE_FRAMES_REQUIRED = 10    # K — alias used by confidence_filter.py
CONSECUTIVE_FRAME_LOW_THRESHOLD = 0.65  # low threshold for consecutive frame check
# Aliases used by confidence_filter.py
CONSECUTIVE_FRAMES_REQUIRED = CONFIDENCE_MIN_HITS          # 10
CONSECUTIVE_FRAME_LOW_THRESHOLD = 0.65                     # score threshold for K-hit check

# ── Behavior Analyzer Weights ─────────────────────────────────────────────────
WEIGHT_VERTICAL_ORIENTATION = 0.30
WEIGHT_ARMS_ELEVATED = 0.25
WEIGHT_NO_LIMB_MOTION = 0.20
WEIGHT_FACE_SUBMERGED = 0.15
WEIGHT_YOLO_CLASS = 0.10

# ── Behavior Analyzer Thresholds ─────────────────────────────────────────────
VERTICAL_ANGLE_THRESHOLD_DEG = 30
# CRITICAL: MediaPipe returns normalized coords [0.0, 1.0] — NOT pixels
LIMB_MOTION_STD_THRESHOLD = 0.015   # normalized units (NOT pixels)
FACE_VISIBILITY_THRESHOLD = 0.4
YOLO_DROWNING_CONF_BOOST = 0.6

# ── MQTT ──────────────────────────────────────────────────────────────────────
MQTT_BROKER = "localhost"
MQTT_BROKER_HOST = "localhost"      # alias used by main.py
MQTT_PORT = 1883
MQTT_BROKER_PORT = 1883             # alias used by main.py
MQTT_ALERT_TOPIC = "aquaguard/alert"
MQTT_TOPIC_ALERT = "aquaguard/alert"           # alias used by mqtt_client.py
MQTT_RESET_TOPIC = "aquaguard/alert/reset"
MQTT_TOPIC_RESET = "aquaguard/alert/reset"     # alias used by mqtt_client.py
MQTT_TOPIC_DETECTION = "aquaguard/detection"
MQTT_TOPIC_DEVICE_STATUS = "aquaguard/device/status"

# Aliases used by mqtt_client.py
MQTT_TOPIC_ALERT = MQTT_ALERT_TOPIC
MQTT_TOPIC_DETECTION = "aquaguard/detection"

# ── Camera Reconnect ──────────────────────────────────────────────────────────
RECONNECT_BACKOFF_SECONDS = [1, 2, 4, 8, 30]
RECONNECT_MAX_CONSECUTIVE_FAILURES = 5

# ── Alert ─────────────────────────────────────────────────────────────────────
ALARM_DURATION_SECONDS = 30

# ── Snapshot ──────────────────────────────────────────────────────────────────
SNAPSHOT_FORMAT = "jpg"
SNAPSHOT_QUALITY = 85

# ── Live feed + heartbeat ──────────────────────────────────────────────────────
LIVE_SNAPSHOT_JPEG_QUALITY = 75
DETECTION_ENGINE_HEARTBEAT_INTERVAL_SECONDS = 5
LIVE_ARTIFACT_REPLACE_RETRIES = 8
LIVE_ARTIFACT_RETRY_DELAY_SECONDS = 0.01
