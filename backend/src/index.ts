import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

type CropType = "maiz" | "trigo" | "jitomate" | "frijol";

interface SensorReading {
  id: string;
  timestamp: number;    // timestamp enviado por la ESP32
  temperature: number;  // °C
  moisture: number;     // %
  receivedAt: string;   // ISO en el backend
}

interface DeviceConfig {
  id: string;        // ID de la ESP32 (ej: ESP32-01)
  name: string;      // Nombre de la zona
  latitude: number;
  longitude: number;
  crop: CropType;
}

const readings: SensorReading[] = [];
const devices: DeviceConfig[] = [];

const app = express();
app.use(cors());
app.use(bodyParser.json());

const HTTP_PORT = Number(process.env.PORT) || 4000;

// --- SERIAL / BLUETOOTH SPP ---

const SERIAL_PORT_PATH =
  process.env.SERIAL_PORT_PATH || "/dev/tty.SLAB_USBtoUART"; // Ajusta según tu SO
const SERIAL_BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE) || 115200;

try {
  const port = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: SERIAL_BAUD_RATE,
  });

  const parser = port.pipe(
    new ReadlineParser({
      delimiter: "\n",
    })
  );

  parser.on("data", (line: string) => {
    addReadingFromJson(line);
  });

  port.on("open", () => {
    console.log("Puerto serie abierto:", SERIAL_PORT_PATH);
  });

  port.on("error", (err) => {
    console.error("Error en puerto serie:", err);
  });
} catch (err) {
  console.error("No se pudo abrir el puerto serie:", err);
}

function addReadingFromJson(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const parsed = JSON.parse(trimmed);

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.timestamp !== "number" ||
      typeof parsed.temperature !== "number" ||
      typeof parsed.moisture !== "number"
    ) {
      console.warn("Lectura inválida:", parsed);
      return;
    }

    const reading: SensorReading = {
      id: parsed.id,
      timestamp: parsed.timestamp,
      temperature: parsed.temperature,
      moisture: parsed.moisture,
      receivedAt: new Date().toISOString(),
    };

    readings.push(reading);
    // Evitar crecer infinito
    if (readings.length > 5000) {
      readings.shift();
    }
  } catch (err) {
    console.error("Error parseando JSON desde ESP32:", err, "line:", line);
  }
}

// --- ENDPOINTS API ---

// Lecturas recientes
app.get("/api/readings", (req, res) => {
  const limit = Number(req.query.limit) || 100;

  const sorted = [...readings].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  res.json(sorted.slice(0, limit));
});

// Listado de dispositivos / zonas
app.get("/api/devices", (_req, res) => {
  res.json(devices);
});

// Crear nueva zona / dispositivo
app.post("/api/devices", (req, res) => {
  const { id, name, latitude, longitude, crop } = req.body as Partial<DeviceConfig>;

  if (!id || !name || latitude == null || longitude == null || !crop) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  const exists = devices.find((d) => d.id === id);
  if (exists) {
    return res.status(409).json({ message: "Ya existe una zona para ese ID" });
  }

  const device: DeviceConfig = {
    id,
    name,
    latitude: Number(latitude),
    longitude: Number(longitude),
    crop,
  };

  devices.push(device);
  res.status(201).json(device);
});

// Editar zona / dispositivo existente
app.put("/api/devices/:id", (req, res) => {
  const id = req.params.id;
  const { name, latitude, longitude, crop } = req.body as Partial<DeviceConfig>;

  const device = devices.find((d) => d.id === id);
  if (!device) {
    return res.status(404).json({ message: "Zona no encontrada" });
  }

  if (name != null) device.name = name;
  if (latitude != null) device.latitude = Number(latitude);
  if (longitude != null) device.longitude = Number(longitude);
  if (crop != null) device.crop = crop;

  res.json(device);
});

// Servidor HTTP
app.listen(HTTP_PORT, () => {
  console.log(`API escuchando en http://localhost:${HTTP_PORT}`);
});