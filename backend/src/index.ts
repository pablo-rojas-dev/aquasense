import express, { Request, Response } from "express";
import cors from "cors";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const PORT = 4000;
// Ajusta este valor al puerto COM de tu ESP32, por ejemplo "COM3", "COM5", etc.
const SERIAL_PORT_PATH = process.env.SERIAL_PORT_PATH || "COM5";
const SERIAL_BAUD_RATE = 115200;
const MAX_READINGS = 200;

export interface SensorReading {
  timestamp: number;      // ms desde arranque del ESP32
  temperature: number;    // °C
  moisture: number;       // %
  receivedAt: string;     // ISO fecha/hora en el PC
}

const readings: SensorReading[] = [];

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Endpoint para obtener las últimas lecturas
 * GET /api/readings?limit=50
 */
app.get("/api/readings", (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  const data = readings.slice(-limit);
  res.json(data);
});

// --------- Puerto serie con el ESP32 ---------

function setupSerial() {
  const port = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: SERIAL_BAUD_RATE
  });

  const parser = port.pipe(
    new ReadlineParser({ delimiter: "\n" }) // cada línea enviada desde el ESP32
  );

  port.on("open", () => {
    console.log(`Puerto serie abierto: ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD_RATE}`);
  });

  port.on("error", (err) => {
    console.error("Error en el puerto serie:", err);
  });

  parser.on("data", (line: string) => {
    handleIncomingLine(line);
  });
}

function handleIncomingLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const json = JSON.parse(trimmed) as {
      timestamp: number;
      temperature: number;
      moisture: number;
    };

    const reading: SensorReading = {
      timestamp: json.timestamp,
      temperature: json.temperature,
      moisture: json.moisture,
      receivedAt: new Date().toISOString()
    };

    readings.push(reading);
    if (readings.length > MAX_READINGS) {
      readings.splice(0, readings.length - MAX_READINGS);
    }

    console.log("Lectura recibida:", reading);
  } catch (err) {
    console.error("Error parseando JSON desde ESP32:", err, "Línea:", trimmed);
  }
}

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
  setupSerial();
});
