#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"
#include <time.h>

// ===== WIFI =====
const char *WIFI_SSID = "PANGLIMIT_4G";
const char *WIFI_PASSWORD = "panglimit54321";

// ===== FIREBASE =====
const char *DEVICE_ID = "ESP32-S3-UNO-01";
const char *WRITE_KEY = "KEY-B48D2CD66FE74190A917";

const char *FIREBASE_RTDB_URL =
    "https://health-monitoring-system-fff52-default-rtdb.asia-southeast1.firebasedatabase.app";

// ===== LCD I2C ESP32-S3 =====
#define SDA_PIN 8
#define SCL_PIN 9
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ===== HC-SR04 =====
#define TRIG_PIN 4
#define ECHO_PIN 5

// ===== KALIBRASI TINGGI =====
const float POLE_HEIGHT_CM = 202.5;
const float HEIGHT_OFFSET_CM = 0.0;

const float MIN_VALID_HEIGHT_CM = 140.0;
const float MAX_VALID_HEIGHT_CM = 220.0;

// ===== HX711 =====
#define HX711_DOUT 6
#define HX711_SCK 7

HX711 scale;

// ===== KALIBRASI BERAT =====
float calibration_factor = 22432.0;

// ===== BUZZER AKTIF =====
#define BUZZER_PIN 10

// ===== FILTER =====
const float MIN_WEIGHT_TO_MEASURE_HEIGHT = 5.0;
const float WEIGHT_RESET_KG = 5.0;
const unsigned long WEIGHT_SETTLE_DELAY_MS = 3000;
const float WEIGHT_STABLE_TOLERANCE_KG = 0.6;
const int WEIGHT_STABLE_REQUIRED_COUNT = 6;
const float WEIGHT_WINDOW_SPREAD_MAX_KG = 1.2;
const float HEIGHT_WINDOW_SPREAD_MAX_CM = 1.5;
const int MEASUREMENT_RETRY_LIMIT = 4;
const unsigned long DISPLAY_POLL_INTERVAL_MS = 5000;
const unsigned long DISPLAY_ANNOUNCE_MS = 2200;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
const unsigned long LCD_SCROLL_INTERVAL_MS = 280;
const unsigned long LCD_SCROLL_PAUSE_MS = 900;
const int LCD_WIDTH = 16;

float lastDistanceCm = 0;
String linkedUserName = "";
String linkedRequestAt = "";
unsigned long lastDisplayPollMs = 0;
unsigned long displayAnnouncementUntilMs = 0;
unsigned long lastHeartbeatMs = 0;
String lastLcdLine1 = "";
String lastLcdLine2 = "";
String activeScrollSource = "";
int activeScrollOffset = 0;
unsigned long lastScrollTickMs = 0;
unsigned long scrollPauseUntilMs = 0;

void beep(int durasi)
{
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durasi);
  digitalWrite(BUZZER_PIN, LOW);
}

String padRight(String text, int width)
{
  while (text.length() < width)
  {
    text += " ";
  }

  return text.substring(0, width);
}

String buildScrollingLine(String source)
{
  if (source.length() <= LCD_WIDTH)
  {
    activeScrollSource = "";
    activeScrollOffset = 0;
    return padRight(source, LCD_WIDTH);
  }

  if (source != activeScrollSource)
  {
    activeScrollSource = source;
    activeScrollOffset = 0;
    lastScrollTickMs = millis();
    scrollPauseUntilMs = millis() + LCD_SCROLL_PAUSE_MS;
  }

  String scrollBuffer = source + "   ";

  if (millis() >= scrollPauseUntilMs &&
      millis() - lastScrollTickMs >= LCD_SCROLL_INTERVAL_MS)
  {
    activeScrollOffset++;
    lastScrollTickMs = millis();

    if (activeScrollOffset >= scrollBuffer.length())
    {
      activeScrollOffset = 0;
      scrollPauseUntilMs = millis() + LCD_SCROLL_PAUSE_MS;
    }
  }

  String visible = "";
  for (int i = 0; i < LCD_WIDTH; i++)
  {
    int index = (activeScrollOffset + i) % scrollBuffer.length();
    visible += scrollBuffer.charAt(index);
  }

  return visible;
}

void showStatus(String line1, String line2 = "", bool scrollLine2 = false)
{
  line1 = padRight(line1, LCD_WIDTH);
  line2 = scrollLine2 ? buildScrollingLine(line2) : padRight(line2, LCD_WIDTH);

  if (line1 == lastLcdLine1 && line2 == lastLcdLine2)
  {
    return;
  }

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);

  lastLcdLine1 = line1;
  lastLcdLine2 = line2;
}

void connectWiFi()
{
  showStatus("Menyambung WiFi", WIFI_SSID, true);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000)
  {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\nWiFi OK");
    showStatus("Jaringan Siap", WiFi.localIP().toString());
  }
  else
  {
    Serial.println("\nWiFi gagal");
    showStatus("WiFi Gagal", "Periksa hotspot");
  }

  delay(1000);
}

void syncClock()
{
  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");

  time_t now = time(nullptr);
  unsigned long start = millis();

  while (now < 1700000000 && millis() - start < 10000)
  {
    delay(250);
    now = time(nullptr);
  }
}

String isoTimestamp()
{
  time_t now = time(nullptr);

  if (now < 1700000000)
  {
    return "2026-06-14T00:00:00.000Z";
  }

  struct tm timeInfo;
  gmtime_r(&now, &timeInfo);

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", &timeInfo);

  return String(buffer);
}

String jsonEscape(String value)
{
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  return value;
}

String buildFirebaseUrl()
{
  return String(FIREBASE_RTDB_URL) +
         "/device_stream/" +
         String(DEVICE_ID) +
         ".json";
}

String buildDeviceDisplayUrl()
{
  return String(FIREBASE_RTDB_URL) +
         "/device_display/" +
         String(DEVICE_ID) +
         ".json";
}

String buildDevicePresenceUrl()
{
  return String(FIREBASE_RTDB_URL) +
         "/device_presence/" +
         String(DEVICE_ID) +
         ".json";
}

String extractJsonStringValue(const String &json, const String &key)
{
  String pattern = String("\"") + key + "\":\"";
  int start = json.indexOf(pattern);

  if (start < 0)
  {
    return "";
  }

  start += pattern.length();
  String value = "";
  bool escapeNext = false;

  for (int i = start; i < json.length(); i++)
  {
    char current = json.charAt(i);

    if (escapeNext)
    {
      value += current;
      escapeNext = false;
      continue;
    }

    if (current == '\\')
    {
      escapeNext = true;
      continue;
    }

    if (current == '"')
    {
      break;
    }

    value += current;
  }

  return value;
}

String formatLinkedUserLine()
{
  if (linkedUserName.length() > 0)
  {
    return String("Pengguna: ") + linkedUserName;
  }

  return String("Perangkat: ") + String(DEVICE_ID);
}

void showLinkedUserStatus(bool isAnnouncement = false)
{
  String title = linkedUserName.length() > 0
                     ? (isAnnouncement ? "Pengguna Aktif" : "Siap Digunakan")
                     : "Silakan Naik";

  showStatus(title, formatLinkedUserLine(), true);
}

bool fetchLinkedUserDisplay(String &userName, String &requestedAt)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, buildDeviceDisplayUrl());

  int httpCode = http.GET();
  String response = http.getString();

  http.end();

  if (httpCode < 200 || httpCode >= 300)
  {
    Serial.print("Gagal baca device_display, HTTP: ");
    Serial.println(httpCode);
    return false;
  }

  if (response == "null" || response.length() == 0)
  {
    userName = "";
    requestedAt = "";
    return true;
  }

  userName = extractJsonStringValue(response, "userName");
  requestedAt = extractJsonStringValue(response, "requestedAt");
  return true;
}

void refreshLinkedUserFromFirebase(bool force = false)
{
  if (!force && millis() - lastDisplayPollMs < DISPLAY_POLL_INTERVAL_MS)
  {
    return;
  }

  lastDisplayPollMs = millis();

  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
  }

  String nextUserName = "";
  String nextRequestedAt = "";
  bool ok = fetchLinkedUserDisplay(nextUserName, nextRequestedAt);

  if (!ok)
  {
    return;
  }

  bool changed = nextUserName != linkedUserName || nextRequestedAt != linkedRequestAt;
  linkedUserName = nextUserName;
  linkedRequestAt = nextRequestedAt;

  if (changed && linkedUserName.length() > 0)
  {
    Serial.print("User aktif di web: ");
    Serial.println(linkedUserName);
    displayAnnouncementUntilMs = millis() + DISPLAY_ANNOUNCE_MS;
    beep(120);
  }
}

String buildPayload(float heightCm, float weightKg)
{
  float bmi = 0;
  if (heightCm > 0 && weightKg > 0)
  {
    float heightM = heightCm / 100.0;
    bmi = weightKg / (heightM * heightM);
  }

  String payload = "{";
  payload += "\"deviceId\":\"" + jsonEscape(DEVICE_ID) + "\",";
  payload += "\"writeKey\":\"" + jsonEscape(WRITE_KEY) + "\",";
  payload += "\"height\":" + String(heightCm, 1) + ",";
  payload += "\"weight\":" + String(weightKg, 1) + ",";
  payload += "\"bmi\":" + String(bmi, 1) + ",";
  payload += "\"heartRate\":0,";
  payload += "\"steps\":0,";
  payload += "\"bloodPressure\":\"0/0\",";
  payload += "\"createdAt\":\"" + isoTimestamp() + "\"";
  payload += "}";

  return payload;
}

String buildPresencePayload()
{
  String payload = "{";
  payload += "\"deviceId\":\"" + jsonEscape(DEVICE_ID) + "\",";
  payload += "\"writeKey\":\"" + jsonEscape(WRITE_KEY) + "\",";
  payload += "\"lastSeenAt\":\"" + isoTimestamp() + "\",";
  payload += "\"status\":\"online\",";
  payload += "\"ipAddress\":\"" + jsonEscape(WiFi.localIP().toString()) + "\"";

  if (linkedUserName.length() > 0)
  {
    payload += ",\"userName\":\"" + jsonEscape(linkedUserName) + "\"";
  }

  payload += "}";
  return payload;
}

bool sendMeasurementToFirebase(float heightCm, float weightKg)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();

    if (WiFi.status() != WL_CONNECTED)
    {
      return false;
    }
  }

  showStatus("Mengirim Data",
             String(heightCm, 1) + "cm " + String(weightKg, 1) + "kg");

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, buildFirebaseUrl());
  http.addHeader("Content-Type", "application/json");

  String payload = buildPayload(heightCm, weightKg);

  int httpCode = http.POST(payload);
  String response = http.getString();

  http.end();

  Serial.println(payload);
  Serial.print("HTTP: ");
  Serial.println(httpCode);
  Serial.println(response);

  return httpCode >= 200 && httpCode < 300;
}

bool sendHeartbeatToFirebase(bool force = false)
{
  if (!force && millis() - lastHeartbeatMs < HEARTBEAT_INTERVAL_MS)
  {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();

    if (WiFi.status() != WL_CONNECTED)
    {
      return false;
    }
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, buildDevicePresenceUrl());
  http.addHeader("Content-Type", "application/json");

  String payload = buildPresencePayload();
  int httpCode = http.PUT(payload);
  String response = http.getString();

  http.end();

  if (httpCode >= 200 && httpCode < 300)
  {
    lastHeartbeatMs = millis();
    return true;
  }

  Serial.print("Heartbeat gagal, HTTP: ");
  Serial.println(httpCode);
  Serial.println(response);
  return false;
}

float readDistanceCm()
{
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 20000);

  if (duration <= 0)
    return -1;

  float distance = duration * 0.0343 / 2.0;

  if (distance < 2 || distance > 250)
    return -1;

  return distance;
}

float readHeightCm()
{
  const int sampleCount = 24;

  float heights[sampleCount];
  float distances[sampleCount];

  int valid = 0;

  for (int i = 0; i < sampleCount; i++)
  {
    float distance = readDistanceCm();

    if (distance > 5 && distance < POLE_HEIGHT_CM)
    {
      float height = POLE_HEIGHT_CM - distance + HEIGHT_OFFSET_CM;

      if (height >= MIN_VALID_HEIGHT_CM &&
          height <= MAX_VALID_HEIGHT_CM)
      {
        heights[valid] = height;
        distances[valid] = distance;
        valid++;
      }
    }

    delay(35);
  }

  if (valid < 8)
  {
    lastDistanceCm = 0;
    return 0;
  }

  for (int i = 0; i < valid - 1; i++)
  {
    for (int j = i + 1; j < valid; j++)
    {
      if (heights[j] < heights[i])
      {
        float temp = heights[i];
        heights[i] = heights[j];
        heights[j] = temp;

        temp = distances[i];
        distances[i] = distances[j];
        distances[j] = temp;
      }
    }
  }

  float total = 0;
  int count = 0;
  int start = valid / 4;
  int end = valid - start;

  for (int i = start; i < end; i++)
  {
    total += heights[i];
    count++;
  }

  if (count == 0)
  {
    lastDistanceCm = 0;
    return 0;
  }

  float stableSpread = heights[end - 1] - heights[start];
  if (stableSpread > HEIGHT_WINDOW_SPREAD_MAX_CM)
  {
    Serial.print("Tinggi belum stabil, spread: ");
    Serial.println(stableSpread, 2);
    lastDistanceCm = 0;
    return 0;
  }

  float height = total / count;
  lastDistanceCm = POLE_HEIGHT_CM - height;
  return height;
}

float readWeightKg()
{
  if (!scale.is_ready())
  {
    Serial.println("HX711 TIDAK TERDETEKSI");
    return 0;
  }

  float weight = scale.get_units(5);

  if (weight < 0 || weight >= 250)
  {
    return 0;
  }

  return weight;
}

float readStableWeightKg()
{
  const int sampleCount = 24;
  float samples[sampleCount];
  int valid = 0;

  for (int i = 0; i < sampleCount; i++)
  {
    float w = readWeightKg();

    if (w >= MIN_WEIGHT_TO_MEASURE_HEIGHT && w < 250)
    {
      samples[valid] = w;
      valid++;
    }

    delay(50);
  }

  if (valid < 8)
  {
    return 0;
  }

  for (int i = 0; i < valid - 1; i++)
  {
    for (int j = i + 1; j < valid; j++)
    {
      if (samples[j] < samples[i])
      {
        float temp = samples[i];
        samples[i] = samples[j];
        samples[j] = temp;
      }
    }
  }

  float total = 0;
  int count = 0;
  int start = valid / 4;
  int end = valid - start;

  for (int i = start; i < end; i++)
  {
    total += samples[i];
    count++;
  }

  if (count == 0)
  {
    return 0;
  }

  float stableSpread = samples[end - 1] - samples[start];
  if (stableSpread > WEIGHT_WINDOW_SPREAD_MAX_KG)
  {
    Serial.print("Berat belum stabil, spread: ");
    Serial.println(stableSpread, 2);
    return 0;
  }

  float average = total / count;

  if (average < 0.3)
  {
    average = 0;
  }

  return average;
}

void setup()
{
  Serial.begin(115200);
  delay(500);

  Wire.begin(SDA_PIN, SCL_PIN);

  lcd.init();
  lcd.backlight();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(calibration_factor);

  showStatus("Kosongkan Alat", "Kalibrasi berat");
  delay(3000);

  scale.tare();

  showStatus("Kalibrasi OK", "Silakan naik", true);
  beep(200);
  delay(1500);

  connectWiFi();
  syncClock();
  refreshLinkedUserFromFirebase(true);
  sendHeartbeatToFirebase(true);

  showLinkedUserStatus();
  delay(1000);
}

void loop()
{
  static bool hasilTerkunci = false;
  static bool dataTerkirim = false;
  static unsigned long weightDetectedAt = 0;
  static int stableWeightCount = 0;
  static float lastTriggerWeight = 0;

  static float finalWeightKg = 0;
  static float finalHeightCm = 0;

  refreshLinkedUserFromFirebase();
  sendHeartbeatToFirebase();

  float currentWeight = readWeightKg();

  if (currentWeight < WEIGHT_RESET_KG)
  {
    hasilTerkunci = false;
    dataTerkirim = false;
    weightDetectedAt = 0;
    stableWeightCount = 0;
    lastTriggerWeight = 0;

    finalWeightKg = 0;
    finalHeightCm = 0;
    lastDistanceCm = 0;

    if (millis() < displayAnnouncementUntilMs && linkedUserName.length() > 0)
    {
      showLinkedUserStatus(true);
    }
    else
    {
      showLinkedUserStatus();
    }

    delay(300);
    return;
  }

  if (weightDetectedAt == 0)
  {
    weightDetectedAt = millis();
    stableWeightCount = 0;
    lastTriggerWeight = currentWeight;
  }

  if (!hasilTerkunci && millis() - weightDetectedAt < WEIGHT_SETTLE_DELAY_MS)
  {
    showStatus("Stabilkan Posisi", String(currentWeight, 1) + " kg");
    delay(250);
    return;
  }

  if (!hasilTerkunci)
  {
    if (abs(currentWeight - lastTriggerWeight) <= WEIGHT_STABLE_TOLERANCE_KG)
    {
      stableWeightCount++;
    }
    else
    {
      stableWeightCount = 0;
    }

    lastTriggerWeight = currentWeight;

    if (stableWeightCount < WEIGHT_STABLE_REQUIRED_COUNT)
    {
      showStatus("Menunggu Stabil", String(currentWeight, 1) + " kg");
      delay(250);
      return;
    }
  }

  if (!hasilTerkunci && currentWeight >= MIN_WEIGHT_TO_MEASURE_HEIGHT)
  {
    showStatus("Pengukuran Mulai", "Berdiri tegak", true);
    beep(200);

    finalWeightKg = 0;
    finalHeightCm = 0;

    for (int attempt = 0; attempt < MEASUREMENT_RETRY_LIMIT; attempt++)
    {
      showStatus("Memvalidasi Data", String("Percobaan ") + String(attempt + 1), true);
      delay(200);

      float candidateWeight = readStableWeightKg();
      float candidateHeight = readHeightCm();

      if (candidateWeight > 0 && candidateHeight > 0)
      {
        finalWeightKg = candidateWeight;
        finalHeightCm = candidateHeight;
        break;
      }

      showStatus("Belum Stabil", "Mohon tetap diam", true);
      delay(450);
    }

    if (finalWeightKg > 0 && finalHeightCm > 0)
    {
      hasilTerkunci = true;
      beep(500);
      showStatus("Ukur Selesai", "Data siap dikirim", true);
      delay(300);
    }
    else
    {
      showStatus("Ukur Ulang", "Data belum stabil", true);
      delay(700);
      return;
    }
  }

  showStatus(String("Tinggi ") + String(finalHeightCm, 1) + "cm",
             String("Berat ") + String(finalWeightKg, 1) + "kg");

  Serial.println("======================");
  Serial.print("Jarak kepala ke sensor : ");
  Serial.print(lastDistanceCm, 1);
  Serial.println(" cm");

  Serial.print("Tinggi badan           : ");
  Serial.print(finalHeightCm, 1);
  Serial.println(" cm");

  Serial.print("Berat badan            : ");
  Serial.print(finalWeightKg, 1);
  Serial.println(" kg");

  if (finalHeightCm > 0 && finalWeightKg > 0)
  {
    float heightM = finalHeightCm / 100.0;
    float bmi = finalWeightKg / (heightM * heightM);
    Serial.print("BMI                    : ");
    Serial.println(bmi, 1);
  }

  if (hasilTerkunci && !dataTerkirim && finalHeightCm > 0 && finalWeightKg > 0)
  {
    bool ok = sendMeasurementToFirebase(finalHeightCm, finalWeightKg);

    if (ok)
    {
      showStatus("Data Terkirim", "Firebase aktif");
    }
    else
    {
      showStatus("Kirim Data Gagal", "Periksa WiFi", true);
    }

    dataTerkirim = true;
    delay(1000);
  }

  delay(500);
}
