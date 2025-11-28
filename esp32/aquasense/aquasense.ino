#include <Arduino.h>
#include "BluetoothSerial.h"
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_AHTX0.h>

BluetoothSerial SerialBT;
Adafruit_AHTX0 aht;

// Pines I2C para AHT10
#define SDA_PIN 32
#define SCL_PIN 33

// Sensor de humedad capacitivo
#define MOISTURE_PIN 35

// LED azul integrado (cámbialo si tu LED está en otro pin)
#define LED_PIN 2

// ID de la ESP32 (cámbialo si tienes varias placas)
const char* DEVICE_ID = "ESTACA-01";

const int MOISTURE_AIR_VALUE   = 4095;
const int MOISTURE_WATER_VALUE = 1500;

// Tiempos
const unsigned long SEND_INTERVAL  = 2000; // ms entre envíos de datos
const unsigned long BLINK_INTERVAL = 300;  // ms para parpadeo LED

// Variables para controlar parpadeo y envíos
unsigned long lastBlink = 0;
bool ledState = false;

unsigned long lastSend = 0;

float mapToPercent(int value, int inMin, int inMax) {
  float pct = (float)(value - inMin) * 100.0 / (float)(inMax - inMin);
  return constrain(pct, 0, 100);
}

void setup() {
  Serial.begin(115200);

  // Inicializar I2C en los pines personalizados
  Wire.begin(SDA_PIN, SCL_PIN);

  pinMode(MOISTURE_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);  // Comienza apagado

  // Nombre Bluetooth de la ESP32
  if (!SerialBT.begin("AquaSense-" + String(DEVICE_ID))) {
    Serial.println("Error inicializando Bluetooth SPP");
  }

  if (!aht.begin(&Wire)) {
    Serial.println("No se encontró el AHT10/AHT20. Verifica SDA/SCL.");
  } else {
    Serial.println("AHT10 inicializado correctamente.");
  }
}

void loop() {
  unsigned long now = millis();

  // 1) Gestión del LED según conexión Bluetooth
  bool btConnected = SerialBT.hasClient();

  if (!btConnected) {
    // Parpadeo mientras NO hay cliente conectado
    if (now - lastBlink >= BLINK_INTERVAL) {
      lastBlink = now;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
  } else {
    // Conexión establecida: LED fijo encendido (sin parpadear)
    digitalWrite(LED_PIN, HIGH);
  }

  // 2) Lectura de sensores y envío cada SEND_INTERVAL ms
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;

    sensors_event_t humidity, temp;
    aht.getEvent(&humidity, &temp);

    int rawMoisture = analogRead(MOISTURE_PIN);
    float moisturePercent = mapToPercent(
      rawMoisture,
      MOISTURE_AIR_VALUE,
      MOISTURE_WATER_VALUE
    );

    String payload = "{";
    payload += "\"id\":\"" + String(DEVICE_ID) + "\",";
    payload += "\"timestamp\":" + String(now) + ",";
    payload += "\"temperature\":" + String(temp.temperature, 2) + ",";
    payload += "\"moisture\":" + String(moisturePercent, 1);
    payload += "}\n";

    Serial.println(payload);   // Para depuración por USB
    SerialBT.print(payload);   // Envío por Bluetooth
  }
}
