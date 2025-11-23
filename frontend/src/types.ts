export interface SensorReading {
  timestamp: number;      // ms desde el arranque del ESP32
  temperature: number;    // °C
  moisture: number;       // %
  receivedAt: string;     // fecha/hora en el PC (ISO)
}
