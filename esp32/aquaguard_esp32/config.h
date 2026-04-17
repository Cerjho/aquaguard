#ifndef CONFIG_H
#define CONFIG_H

// Wi-Fi credentials override.
// Keep empty to use serial provisioning + cached credentials in NVS.
#define WIFI_SSID           ""
#define WIFI_PASSWORD       ""

// Wi-Fi provisioning and connect behavior
#define WIFI_CONNECT_MAX_ATTEMPTS      20
#define WIFI_PROVISIONING_TIMEOUT_MS   120000
#define WIFI_PROVISIONING_RETRY_DELAY_MS 5000

// MQTT broker override.
// Leave empty to auto-discover a broker on the local subnet at runtime.
#define MQTT_BROKER         ""
#define MQTT_PORT           1883

// Auto-discovery tuning (used only when MQTT_BROKER is empty)
#define MQTT_DISCOVERY_INTERVAL_MS      30000
#define MQTT_DISCOVERY_MAX_HOST_PROBES  254
#define MQTT_SCAN_CONNECT_TIMEOUT_MS    70
#define MQTT_DISCOVERY_FAILURES_BEFORE_PROMPT 1
#define MQTT_PROVISIONING_PROMPT_WINDOW_MS 5000
#define MQTT_PROVISIONING_INPUT_TIMEOUT_MS 30000
#define MQTT_PROVISIONING_RETRY_DELAY_MS 5000

// GPIO pin driving buzzer/relay
#define ALARM_PIN           26
// Alarm hold timeout after the latest alert message (ms).
// If new alerts keep arriving, this window keeps extending.
#define ALARM_DURATION_MS   5000

// Unique device identifier published in heartbeat
#define DEVICE_ID           "ESP32_AquaGuard_01"

// MQTT topics
#define TOPIC_ALERT         "aquaguard/alert"
#define TOPIC_ALERT_RESET   "aquaguard/alert/reset"
#define TOPIC_STATUS        "aquaguard/device/status"

// Heartbeat interval (ms) — every 10 seconds
#define HEARTBEAT_INTERVAL_MS  10000

// Reconnect retry interval (ms)
#define RECONNECT_INTERVAL_MS  5000

#endif // CONFIG_H
