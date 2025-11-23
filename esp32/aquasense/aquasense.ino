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

// ID de la ESP32 (cámbialo si tienes varias placas)
const char* DEVICE_ID = "ESP32-01";

const int MOISTURE_AIR_VALUE   = 4095;
const int MOISTURE_WATER_VALUE = 1500;

float mapToPercent(int value, int inMin, int inMax) {
  float pct = (float)(value - inMin) * 100.0 / (float)(inMax - inMin);
  return constrain(pct, 0, 100);
}

void setup() {
  Serial.begin(115200);

  // Inicializar I2C en los pines personalizados
  Wire.begin(SDA_PIN, SCL_PIN);

  pinMode(MOISTURE_PIN, INPUT);

  // Nombre Bluetooth de la ESP32
  if (!SerialBT.begin("ESP32-Sensors")) {
    Serial.println("Error inicializando Bluetooth SPP");
  }

  if (!aht.begin(&Wire)) {
    Serial.println("No se encontró el AHT10/AHT20. Verifica SDA/SCL.");
  } else {
    Serial.println("AHT10 inicializado correctamente.");
  }
}

void loop() {
  sensors_event_t humidity, temp;
  aht.getEvent(&humidity, &temp);

  int rawMoisture = analogRead(MOISTURE_PIN);
  float moisturePercent = mapToPercent(
    rawMoisture,
    MOISTURE_AIR_VALUE,
    MOISTURE_WATER_VALUE
  );

  unsigned long ms = millis();

  String payload = "{";
  payload += "\"id\":\"" + String(DEVICE_ID) + "\",";         // <-- NUEVO CAMPO ID
  payload += "\"timestamp\":" + String(ms) + ",";
  payload += "\"temperature\":" + String(temp.temperature, 2) + ",";
  payload += "\"moisture\":" + String(moisturePercent, 1);
  payload += "}\n";

  Serial.println(payload);   // Para depuración por USB
  SerialBT.print(payload);   // Envío por Bluetooth

  delay(2000);
}
