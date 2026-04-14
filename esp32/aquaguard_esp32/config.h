#ifndef CONFIG_H
#define CONFIG_H

// Wi-Fi credentials — change before flashing
#define WIFI_SSID           "BarcelaFi_2.4GHz"
#define WIFI_PASSWORD       "FamilyNet@24"

// MQTT broker — edge server LAN IP
#define MQTT_BROKER         "192.168.1.15"
#define MQTT_PORT           1883

// GPIO pin driving buzzer/relay
#define ALARM_PIN           26
// How long to sound the alarm (ms) — 30 seconds
#define ALARM_DURATION_MS   30000

// Unique device identifier published in heartbeat
#define DEVICE_ID           "ESP32_AquaGuard_01"

// MQTT topics
#define TOPIC_ALERT         "aquaguard/alert"
#define TOPIC_ALERT_RESET   "aquaguard/alert/reset"
#define TOPIC_STATUS        "aquaguard/device/status"

// Heartbeat interval (ms) — every 30 seconds
#define HEARTBEAT_INTERVAL_MS  30000

// Reconnect retry interval (ms)
#define RECONNECT_INTERVAL_MS  5000

#endif // CONFIG_H
