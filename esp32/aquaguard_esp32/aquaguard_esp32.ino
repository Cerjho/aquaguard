/**
 * AquaGuard ESP32 Firmware
 * ========================
 * Subscribes to MQTT alert topics from the AquaGuard detection engine.
 * Drives a buzzer/relay on ALARM_PIN when a drowning alert is received.
 * Publishes a heartbeat every HEARTBEAT_INTERVAL_MS to TOPIC_STATUS.
 *
 * Libraries required (install via Arduino IDE Library Manager):
 *   - PubSubClient  2.8.0   by Nick O'Leary
 *   - ArduinoJson   7.1.0   by Benoit Blanchon
 *   - WiFi          (built-in, ESP32 board package 2.0.17 by Espressif)
 *
 * Board target: ESP32 Dev Module
 * All configuration values are in config.h — never hardcode here.
 */

#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ── Globals ────────────────────────────────────────────────────────────────

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastHeartbeatMs   = 0;
unsigned long lastReconnectAtMs = 0;

// ── Forward declarations ───────────────────────────────────────────────────

void connectWiFi();
void connectMQTT();
void publishHeartbeat();
void callback(char* topic, byte* payload, unsigned int length);

// ── setup() ───────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[AquaGuard] Firmware starting...");

  // Configure alarm GPIO
  pinMode(ALARM_PIN, OUTPUT);
  digitalWrite(ALARM_PIN, LOW);
  Serial.printf("[AquaGuard] ALARM_PIN %d configured as OUTPUT (default LOW)\n", ALARM_PIN);

  // Connect to Wi-Fi
  connectWiFi();

  // Configure and connect MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(callback);
  connectMQTT();
}

// ── loop() ────────────────────────────────────────────────────────────────

void loop() {
  // ── Wi-Fi reconnect guard ──────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Connection lost — reconnecting...");
    connectWiFi();
  }

  // ── MQTT reconnect guard ───────────────────────────────────────────────
  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAtMs >= RECONNECT_INTERVAL_MS) {
      lastReconnectAtMs = now;
      Serial.println("[MQTT] Not connected — attempting reconnect...");
      connectMQTT();
    }
  }

  // Process incoming MQTT messages and maintain keep-alive
  mqttClient.loop();

  // ── Heartbeat ─────────────────────────────────────────────────────────
  unsigned long now = millis();
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }
}

// ── connectWiFi() ─────────────────────────────────────────────────────────

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(RECONNECT_INTERVAL_MS);
    attempts++;
    Serial.printf("[WiFi] Waiting... attempt %d (status=%d)\n", attempts, WiFi.status());
  }

  Serial.printf("[WiFi] Connected! IP address: %s\n",
                WiFi.localIP().toString().c_str());
}

// ── connectMQTT() ─────────────────────────────────────────────────────────

void connectMQTT() {
  if (mqttClient.connected()) return;

  Serial.printf("[MQTT] Connecting to broker %s:%d as client '%s'...\n",
                MQTT_BROKER, MQTT_PORT, DEVICE_ID);

  if (mqttClient.connect(DEVICE_ID)) {
    Serial.println("[MQTT] Connected to broker.");

    // Subscribe to alert topic (QoS 1)
    if (mqttClient.subscribe(TOPIC_ALERT, 1)) {
      Serial.printf("[MQTT] Subscribed to '%s' (QoS 1)\n", TOPIC_ALERT);
    } else {
      Serial.printf("[MQTT] ERROR: Failed to subscribe to '%s'\n", TOPIC_ALERT);
    }

    // Subscribe to reset topic (QoS 1)
    if (mqttClient.subscribe(TOPIC_ALERT_RESET, 1)) {
      Serial.printf("[MQTT] Subscribed to '%s' (QoS 1)\n", TOPIC_ALERT_RESET);
    } else {
      Serial.printf("[MQTT] ERROR: Failed to subscribe to '%s'\n", TOPIC_ALERT_RESET);
    }

    // Publish an online heartbeat immediately after connecting
    publishHeartbeat();

  } else {
    Serial.printf("[MQTT] Connection failed — rc=%d. Will retry in %dms.\n",
                  mqttClient.state(), RECONNECT_INTERVAL_MS);
  }
}

// ── callback() ────────────────────────────────────────────────────────────
// Called by PubSubClient when a subscribed message arrives.

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Message received on topic: %s (%u bytes)\n", topic, length);

  // Copy payload into a null-terminated string for ArduinoJson
  char jsonBuffer[256];
  unsigned int copyLen = (length < sizeof(jsonBuffer) - 1) ? length : sizeof(jsonBuffer) - 1;
  memcpy(jsonBuffer, payload, copyLen);
  jsonBuffer[copyLen] = '\0';

  // Parse JSON (ArduinoJson 7.x)
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, jsonBuffer);
  if (err) {
    Serial.printf("[MQTT] JSON parse error: %s — raw payload: %s\n",
                  err.c_str(), jsonBuffer);
    // Continue processing even if JSON is malformed — topic action still applies
  } else {
    Serial.printf("[MQTT] JSON parsed OK — alert_id: %s  zone_id: %s\n",
                  doc["alert_id"] | "n/a",
                  doc["zone_id"]  | "n/a");
  }

  // ── Handle aquaguard/alert ─────────────────────────────────────────────
  if (strcmp(topic, TOPIC_ALERT) == 0) {
    Serial.printf("[ALARM] ALERT received — activating GPIO %d HIGH for %dms\n",
                  ALARM_PIN, ALARM_DURATION_MS);
    digitalWrite(ALARM_PIN, HIGH);
    delay(ALARM_DURATION_MS);
    digitalWrite(ALARM_PIN, LOW);
    Serial.printf("[ALARM] Alarm cycle complete — GPIO %d back to LOW\n", ALARM_PIN);

  // ── Handle aquaguard/alert/reset ──────────────────────────────────────
  } else if (strcmp(topic, TOPIC_ALERT_RESET) == 0) {
    Serial.printf("[ALARM] RESET received — setting GPIO %d LOW immediately\n", ALARM_PIN);
    digitalWrite(ALARM_PIN, LOW);
    Serial.println("[ALARM] Alarm silenced by reset command.");

  } else {
    Serial.printf("[MQTT] Unhandled topic: %s\n", topic);
  }
}

// ── publishHeartbeat() ────────────────────────────────────────────────────

void publishHeartbeat() {
  if (!mqttClient.connected()) {
    Serial.println("[Heartbeat] Skipped — MQTT not connected.");
    return;
  }

  // Build JSON payload using ArduinoJson 7.x
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["status"]    = "online";
  doc["uptime_ms"] = (unsigned long)millis();

  char jsonBuffer[128];
  size_t n = serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));

  if (mqttClient.publish(TOPIC_STATUS, jsonBuffer)) {
    Serial.printf("[Heartbeat] Published to '%s': %s\n", TOPIC_STATUS, jsonBuffer);
  } else {
    Serial.printf("[Heartbeat] ERROR: Failed to publish to '%s'\n", TOPIC_STATUS);
  }
}
