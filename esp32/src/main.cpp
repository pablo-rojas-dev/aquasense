#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h> // Instalar librería Adafruit AHTX0
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

Adafruit_AHTX0 aht;
const int MOISTURE_PIN = 34; // Pin analógico para el sensor de humedad

// Configuración BLE UART (Nordic UART Service)
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      pServer->getAdvertising()->start(); // Reiniciar publicidad si se desconecta
    }
};

void setup() {
  Serial.begin(115200);

  // Inicializar AHT10
  if (!aht.begin()) {
    Serial.println("No se encontró el AHT10");
    while (1) delay(10);
  }

  // Configuración BLE
  BLEDevice::init("ESP32_Sensors");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  pTxCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("Esperando conexión BLE...");
}

void loop() {
  if (deviceConnected) {
    // 1. Leer Temperatura
    sensors_event_t humidity, temp;
    aht.getEvent(&humidity, &temp);

    // 2. Leer Humedad Suelo (Calibrar estos valores según tu sensor: Aire vs Agua)
    int sensorVal = analogRead(MOISTURE_PIN);
    int moisturePercent = map(sensorVal, 3000, 1200, 0, 100); // Ejemplo: 3000 seco, 1200 mojado
    moisturePercent = constrain(moisturePercent, 0, 100);

    // 3. Crear JSON
    String json = "{\"t\":" + String(temp.temperature, 1) + 
                  ",\"m\":" + String(moisturePercent) + "}";
    
    // 4. Enviar por BLE
    pTxCharacteristic->setValue((uint8_t*)json.c_str(), json.length());
    pTxCharacteristic->notify();
    
    Serial.println("Enviado: " + json);
    delay(2000); // Enviar cada 2 segundos
  }
}