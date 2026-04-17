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
 *   - Preferences   (built-in, stores last discovered broker IP)
 *   - WiFi          (built-in, ESP32 board package 2.0.17 by Espressif)
 *
 * Board target: ESP32 Dev Module
 * All configuration values are in config.h — never hardcode here.
 */

#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ── Globals ────────────────────────────────────────────────────────────────

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences  prefs;

unsigned long lastHeartbeatMs   = 0;
unsigned long lastReconnectAtMs = 0;
unsigned long lastDiscoveryAtMs = 0;
unsigned long lastMqttProvisionPromptAtMs = 0;
unsigned long lastAlertAtMs = 0;
unsigned int mqttDiscoveryFailures = 0;
bool prefsReady = false;
bool alarmActive = false;
char mqttBrokerTarget[64] = "";
char wifiSsid[33] = "";
char wifiPassword[65] = "";

// ── Forward declarations ───────────────────────────────────────────────────

void connectWiFi();
void connectMQTT();
void publishHeartbeat();
void callback(char* topic, byte* payload, unsigned int length);
bool configureBrokerEndpoint(bool forceDiscovery);
bool discoverBrokerIp(IPAddress& brokerIp);
bool probeBrokerPort(const IPAddress& brokerIp);
bool loadCachedBrokerIp(IPAddress& brokerIp);
void saveCachedBrokerIp(const IPAddress& brokerIp);
void applyBrokerIp(const IPAddress& brokerIp);
bool runSerialMqttProvisioning();
bool prepareWiFiCredentials(bool forceSerialProvisioning);
bool loadCachedWiFiCredentials();
bool runSerialWiFiProvisioning();
void saveWiFiCredentials();
bool readLineFromSerial(char* buffer, size_t bufferSize, unsigned long timeoutMs);

// ── setup() ───────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[AquaGuard] Firmware starting...");

  // Configure alarm GPIO
  pinMode(ALARM_PIN, OUTPUT);
  digitalWrite(ALARM_PIN, LOW);
  Serial.printf("[AquaGuard] ALARM_PIN %d configured as OUTPUT (default LOW)\n", ALARM_PIN);

  // Prepare key-value storage early so Wi-Fi provisioning can use it.
  prefsReady = prefs.begin("aquaguard", false);
  if (!prefsReady) {
    Serial.println("[System] WARNING: NVS unavailable. Cached settings disabled.");
  }

  if (!prepareWiFiCredentials(false)) {
    Serial.println("[WiFi] No credentials configured yet. Run serial provisioning.");
  }

  // Connect to Wi-Fi
  connectWiFi();

  // Configure and connect MQTT
  mqttClient.setCallback(callback);
  configureBrokerEndpoint(false);
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

  unsigned long now = millis();

  // Keep alarm ON only while alerts continue to arrive.
  if (alarmActive && now - lastAlertAtMs >= ALARM_DURATION_MS) {
    digitalWrite(ALARM_PIN, LOW);
    alarmActive = false;
    Serial.printf(
      "[ALARM] No new alert for %dms — GPIO %d set LOW\n",
      ALARM_DURATION_MS,
      ALARM_PIN
    );
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }
}

// ── connectWiFi() ─────────────────────────────────────────────────────────

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  if (!prepareWiFiCredentials(false)) {
    Serial.printf("[WiFi] Waiting %dms before retrying provisioning...\n",
                  WIFI_PROVISIONING_RETRY_DELAY_MS);
    delay(WIFI_PROVISIONING_RETRY_DELAY_MS);
    return;
  }

  Serial.printf("[WiFi] Connecting to SSID: %s\n", wifiSsid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPassword);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_CONNECT_MAX_ATTEMPTS) {
    delay(RECONNECT_INTERVAL_MS);
    attempts++;
    Serial.printf("[WiFi] Waiting... attempt %d (status=%d)\n", attempts, WiFi.status());
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[WiFi] Failed to connect after %d attempts.\n", attempts);
    WiFi.disconnect(true, true);

    if (strlen(WIFI_SSID) == 0) {
      Serial.println("[WiFi] Stored credentials failed. Re-enter credentials via serial.");
      if (prefsReady) {
        prefs.remove("wifi_ssid");
        prefs.remove("wifi_pass");
      }
      wifiSsid[0] = '\0';
      wifiPassword[0] = '\0';
      prepareWiFiCredentials(true);
    }
    return;
  }

  Serial.printf("[WiFi] Connected! IP address: %s\n",
                WiFi.localIP().toString().c_str());

  // Force broker endpoint refresh after any Wi-Fi reconnection.
  mqttBrokerTarget[0] = '\0';
}

// ── Wi-Fi provisioning helpers ────────────────────────────────────────────

bool prepareWiFiCredentials(bool forceSerialProvisioning) {
  if (!forceSerialProvisioning && strlen(wifiSsid) > 0) {
    return true;
  }

  if (!forceSerialProvisioning && strlen(WIFI_SSID) > 0) {
    snprintf(wifiSsid, sizeof(wifiSsid), "%s", WIFI_SSID);
    snprintf(wifiPassword, sizeof(wifiPassword), "%s", WIFI_PASSWORD);
    saveWiFiCredentials();
    return true;
  }

  if (!forceSerialProvisioning && loadCachedWiFiCredentials()) {
    Serial.printf("[WiFi] Using provisioned SSID: %s\n", wifiSsid);
    return true;
  }

  return runSerialWiFiProvisioning();
}

bool loadCachedWiFiCredentials() {
  if (!prefsReady) {
    return false;
  }

  String cachedSsid = prefs.getString("wifi_ssid", "");
  if (cachedSsid.length() == 0) {
    return false;
  }

  String cachedPassword = prefs.getString("wifi_pass", "");
  snprintf(wifiSsid, sizeof(wifiSsid), "%s", cachedSsid.c_str());
  snprintf(wifiPassword, sizeof(wifiPassword), "%s", cachedPassword.c_str());
  return true;
}

bool runSerialWiFiProvisioning() {
  Serial.println("[WiFi] Serial provisioning mode enabled.");
  Serial.println("[WiFi] Enter SSID and password with line ending set to Newline.");
  Serial.println("[WiFi] Enter SSID:");

  char ssidBuffer[sizeof(wifiSsid)] = {0};
  if (!readLineFromSerial(ssidBuffer, sizeof(ssidBuffer), WIFI_PROVISIONING_TIMEOUT_MS)) {
    Serial.println("[WiFi] Provisioning timeout while waiting for SSID.");
    return false;
  }

  if (strlen(ssidBuffer) == 0) {
    Serial.println("[WiFi] SSID cannot be empty.");
    return false;
  }

  Serial.println("[WiFi] Enter password (press Enter for open networks):");
  char passwordBuffer[sizeof(wifiPassword)] = {0};
  if (!readLineFromSerial(passwordBuffer, sizeof(passwordBuffer), WIFI_PROVISIONING_TIMEOUT_MS)) {
    Serial.println("[WiFi] Provisioning timeout while waiting for password.");
    return false;
  }

  snprintf(wifiSsid, sizeof(wifiSsid), "%s", ssidBuffer);
  snprintf(wifiPassword, sizeof(wifiPassword), "%s", passwordBuffer);
  saveWiFiCredentials();

  Serial.printf("[WiFi] Provisioned SSID: %s\n", wifiSsid);
  return true;
}

void saveWiFiCredentials() {
  if (!prefsReady || strlen(wifiSsid) == 0) {
    return;
  }

  prefs.putString("wifi_ssid", wifiSsid);
  prefs.putString("wifi_pass", wifiPassword);
}

bool readLineFromSerial(char* buffer, size_t bufferSize, unsigned long timeoutMs) {
  if (bufferSize == 0) {
    return false;
  }

  size_t idx = 0;
  unsigned long startedAtMs = millis();

  while (millis() - startedAtMs < timeoutMs) {
    while (Serial.available() > 0) {
      char c = static_cast<char>(Serial.read());
      if (c == '\r') {
        continue;
      }
      if (c == '\n') {
        buffer[idx] = '\0';
        return true;
      }
      if (idx < bufferSize - 1) {
        buffer[idx++] = c;
      }
    }
    delay(10);
  }

  buffer[idx] = '\0';
  return idx > 0;
}

// ── MQTT endpoint helpers ────────────────────────────────────────────────

bool configureBrokerEndpoint(bool forceDiscovery) {
  if (strlen(MQTT_BROKER) > 0) {
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    snprintf(mqttBrokerTarget, sizeof(mqttBrokerTarget), "%s", MQTT_BROKER);
    return true;
  }

  if (!forceDiscovery && mqttBrokerTarget[0] != '\0') {
    return true;
  }

  IPAddress cachedIp;
  if (!forceDiscovery && loadCachedBrokerIp(cachedIp)) {
    applyBrokerIp(cachedIp);
    Serial.printf("[MQTT] Using cached broker %s:%d\n", mqttBrokerTarget, MQTT_PORT);
    mqttDiscoveryFailures = 0;
    return true;
  }

  unsigned long now = millis();
  if (!forceDiscovery && (now - lastDiscoveryAtMs < MQTT_DISCOVERY_INTERVAL_MS)) {
    return false;
  }

  lastDiscoveryAtMs = now;
  Serial.println("[MQTT] Discovering broker on local subnet...");

  IPAddress discoveredIp;
  if (!discoverBrokerIp(discoveredIp)) {
    mqttDiscoveryFailures++;
    Serial.println("[MQTT] Discovery failed — no broker responded on port 1883.");

    if (mqttDiscoveryFailures >= MQTT_DISCOVERY_FAILURES_BEFORE_PROMPT &&
        now - lastMqttProvisionPromptAtMs >= MQTT_PROVISIONING_RETRY_DELAY_MS) {
      lastMqttProvisionPromptAtMs = now;
      if (runSerialMqttProvisioning()) {
        mqttDiscoveryFailures = 0;
        return true;
      }
    }

    return false;
  }

  applyBrokerIp(discoveredIp);
  saveCachedBrokerIp(discoveredIp);
  mqttDiscoveryFailures = 0;
  Serial.printf("[MQTT] Discovered broker at %s:%d\n", mqttBrokerTarget, MQTT_PORT);
  return true;
}

bool runSerialMqttProvisioning() {
  Serial.printf(
    "[MQTT] Auto-discovery failed. Start typing broker IP within %dms...\n",
    MQTT_PROVISIONING_PROMPT_WINDOW_MS
  );

  unsigned long waitStartedAtMs = millis();
  while (Serial.available() == 0 &&
         millis() - waitStartedAtMs < MQTT_PROVISIONING_PROMPT_WINDOW_MS) {
    delay(20);
  }

  if (Serial.available() == 0) {
    Serial.println("[MQTT] No serial input detected. Continuing discovery mode.");
    return false;
  }

  Serial.println("[MQTT] Enter broker IP (example: 10.126.83.130), then press Enter:");
  char brokerBuffer[sizeof(mqttBrokerTarget)] = {0};
  if (!readLineFromSerial(
        brokerBuffer,
        sizeof(brokerBuffer),
        MQTT_PROVISIONING_INPUT_TIMEOUT_MS
      )) {
    Serial.println("[MQTT] Broker provisioning timed out.");
    return false;
  }

  IPAddress brokerIp;
  if (!brokerIp.fromString(brokerBuffer)) {
    Serial.printf("[MQTT] Invalid broker IP '%s'. Keeping discovery mode.\n", brokerBuffer);
    return false;
  }

  applyBrokerIp(brokerIp);
  saveCachedBrokerIp(brokerIp);
  Serial.printf("[MQTT] Provisioned broker %s:%d\n", mqttBrokerTarget, MQTT_PORT);
  return true;
}

bool discoverBrokerIp(IPAddress& brokerIp) {
  IPAddress localIp = WiFi.localIP();
  IPAddress gatewayIp = WiFi.gatewayIP();

  if (probeBrokerPort(gatewayIp)) {
    brokerIp = gatewayIp;
    return true;
  }

  uint16_t probes = 0;
  const uint8_t localLastOctet = localIp[3];

  for (uint16_t step = 1;
       step <= 253 && probes < MQTT_DISCOVERY_MAX_HOST_PROBES;
       step++) {
    int high = static_cast<int>(localLastOctet) + static_cast<int>(step);
    if (high <= 254 && probes < MQTT_DISCOVERY_MAX_HOST_PROBES) {
      IPAddress candidate(
        localIp[0],
        localIp[1],
        localIp[2],
        static_cast<uint8_t>(high)
      );

      if (candidate != gatewayIp && probeBrokerPort(candidate)) {
        brokerIp = candidate;
        return true;
      }
      probes++;
    }

    int low = static_cast<int>(localLastOctet) - static_cast<int>(step);
    if (low >= 1 && probes < MQTT_DISCOVERY_MAX_HOST_PROBES) {
      IPAddress candidate(
        localIp[0],
        localIp[1],
        localIp[2],
        static_cast<uint8_t>(low)
      );

      if (candidate != gatewayIp && probeBrokerPort(candidate)) {
        brokerIp = candidate;
        return true;
      }
      probes++;
    }
  }

  return false;
}

bool probeBrokerPort(const IPAddress& brokerIp) {
  WiFiClient probeClient;
  bool connected = probeClient.connect(
    brokerIp,
    MQTT_PORT,
    MQTT_SCAN_CONNECT_TIMEOUT_MS
  );
  if (connected) {
    probeClient.stop();
    return true;
  }
  return false;
}

bool loadCachedBrokerIp(IPAddress& brokerIp) {
  if (!prefsReady) {
    return false;
  }

  String cachedIp = prefs.getString("mqtt_ip", "");
  if (cachedIp.length() == 0) {
    return false;
  }

  if (!brokerIp.fromString(cachedIp)) {
    prefs.remove("mqtt_ip");
    return false;
  }

  return true;
}

void saveCachedBrokerIp(const IPAddress& brokerIp) {
  if (!prefsReady) {
    return;
  }

  prefs.putString("mqtt_ip", brokerIp.toString());
}

void applyBrokerIp(const IPAddress& brokerIp) {
  mqttClient.setServer(brokerIp, MQTT_PORT);
  String brokerAsString = brokerIp.toString();
  snprintf(mqttBrokerTarget, sizeof(mqttBrokerTarget), "%s", brokerAsString.c_str());
}

// ── connectMQTT() ─────────────────────────────────────────────────────────

void connectMQTT() {
  if (mqttClient.connected()) return;

  if (!configureBrokerEndpoint(false)) {
    Serial.println("[MQTT] Broker endpoint unavailable — waiting for discovery.");
    return;
  }

  Serial.printf("[MQTT] Connecting to broker %s:%d as client '%s'...\n",
                mqttBrokerTarget, MQTT_PORT, DEVICE_ID);

  char willPayload[128];
  snprintf(
    willPayload,
    sizeof(willPayload),
    "{\"device_id\":\"%s\",\"status\":\"offline\"}",
    DEVICE_ID
  );

  // Use MQTT Last Will so sudden power loss/unplug marks device offline.
  if (mqttClient.connect(DEVICE_ID, TOPIC_STATUS, 1, true, willPayload)) {
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
    int mqttState = mqttClient.state();
    Serial.printf("[MQTT] Connection failed — rc=%d. Will retry in %dms.\n",
                  mqttState, RECONNECT_INTERVAL_MS);

    // TCP-level failure usually means broker IP changed on hotspot/LAN.
    if (mqttState == -2 && strlen(MQTT_BROKER) == 0) {
      Serial.println("[MQTT] TCP connect failed — clearing cache and forcing discovery.");
      mqttBrokerTarget[0] = '\0';
      if (prefsReady) {
        prefs.remove("mqtt_ip");
      }
      configureBrokerEndpoint(true);
    }
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
    lastAlertAtMs = millis();

    if (!alarmActive) {
      Serial.printf(
        "[ALARM] ALERT received — setting GPIO %d HIGH (hold=%dms)\n",
        ALARM_PIN,
        ALARM_DURATION_MS
      );
    } else {
      Serial.printf(
        "[ALARM] ALERT received — extending hold window by %dms\n",
        ALARM_DURATION_MS
      );
    }

    digitalWrite(ALARM_PIN, HIGH);
    alarmActive = true;

  // ── Handle aquaguard/alert/reset ──────────────────────────────────────
  } else if (strcmp(topic, TOPIC_ALERT_RESET) == 0) {
    Serial.printf("[ALARM] RESET received — setting GPIO %d LOW immediately\n", ALARM_PIN);
    digitalWrite(ALARM_PIN, LOW);
    alarmActive = false;
    lastAlertAtMs = 0;
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

  if (mqttClient.publish(TOPIC_STATUS, jsonBuffer, true)) {
    Serial.printf("[Heartbeat] Published to '%s': %s\n", TOPIC_STATUS, jsonBuffer);
  } else {
    Serial.printf("[Heartbeat] ERROR: Failed to publish to '%s'\n", TOPIC_STATUS);
  }
}
