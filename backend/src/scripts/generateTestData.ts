import fs from "fs";
import path from "path";

type CropType = "maiz" | "trigo" | "jitomate" | "frijol";

interface SeedDevice {
  esp32Id: string; // ID que envía la ESP32
  name: string;
  latitude: number;
  longitude: number;
  crop: CropType;
}

interface SeedReading {
  id: string;
  timestamp: number;
  temperature: number;
  moisture: number;
}

interface SeedFile {
  devices: SeedDevice[];
  readings: SeedReading[];
}

/* ==================
   🔧 VARIABLES EDITABLES
   ================== */
const LAT_START = 19.4326; // Ejemplo CDMX
const LON_START = -99.1332;

const crops: CropType[] = ["maiz", "trigo", "jitomate", "frijol"];

/* ==================
   📌 GENERAR DEVICES
   ================== */
const devices: SeedDevice[] = Array.from({ length: 9 }).map((_, idx) => {
  const number = idx + 2; // 02 al 10
  const nameChar = String.fromCharCode(66 + idx); // B al J

  return {
    esp32Id: `ESP32-${String(number).padStart(2, "0")}`,
    name: `Zona - ${nameChar}`,
    latitude: LAT_START + idx * 0.001,
    longitude: LON_START - idx * 0.001,
    crop: crops[idx % crops.length],
  };
});

/* ==================
   🤖 GENERAR LECTURAS
   ================== */
const readings: SeedReading[] = [];

const startDate = new Date("2025-01-01T00:00:00Z").getTime();
const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

for (const dev of devices) {
  for (let dayStart = startDate; dayStart <= now; dayStart += dayMs) {
    const dayDate = new Date(dayStart);
    const isToday =
      dayDate.toDateString() === new Date().toDateString();

    if (isToday) {
      // Cada 2 segundos desde la medianoche de hoy hasta ahora
      const interval = 2 * 1000;
      for (let t = dayStart; t <= now; t += interval) {
        readings.push(fakeReading(dev.esp32Id, t, dev.crop));
      }
    } else {
      // 2 lecturas por día histórico (mañana y noche)
      const morning = dayStart + 8 * 60 * 60 * 1000; // 08:00
      const night = dayStart + 20 * 60 * 60 * 1000; // 20:00
      readings.push(fakeReading(dev.esp32Id, morning, dev.crop));
      readings.push(fakeReading(dev.esp32Id, night, dev.crop));
    }
  }
}

/* ==================
   🌱 FUNCIÓN DE DATOS
   ================== */
function fakeReading(
  id: string,
  timestamp: number,
  crop: CropType
): SeedReading {
  const weekIndex = Math.floor((timestamp - startDate) / (7 * dayMs));

  // Alternar “sequía / ideal / exceso” por semana
  let baseMoisture: number;
  switch (weekIndex % 3) {
    case 0:
      baseMoisture = 35; // Sequía
      break;
    case 1:
      baseMoisture = idealMoistureForCrop(crop); // Ideal
      break;
    default:
      baseMoisture = 85; // Exceso
      break;
  }

  const moisture = clamp(
    baseMoisture + randomOffset(12),
    15,
    95
  );

  // Temperatura con variación suave
  const temperature = clamp(
    22 + randomOffset(8),
    10,
    40
  );

  return {
    id,
    timestamp,
    temperature: Number(temperature.toFixed(2)),
    moisture: Number(moisture.toFixed(2)),
  };
}

function idealMoistureForCrop(crop: CropType): number {
  switch (crop) {
    case "maiz":
      return 70; // dentro de 60–80
    case "trigo":
      return 60; // dentro de 50–70
    case "jitomate":
      return 75; // dentro de 65–85
    case "frijol":
      return 65; // dentro de 55–75
  }
}

function randomOffset(range: number) {
  return Math.random() * range - range / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/* ==================
   💾 EXPORTAR JSON
   ================== */

const seed: SeedFile = { devices, readings };

const outputPath = path.join(process.cwd(), "test-data.json");
fs.writeFileSync(outputPath, JSON.stringify(seed, null, 2), "utf8");

console.log(`
===================== OK =====================
Datos de prueba generados 🎉
📌 Dispositivos: ${devices.length}
📌 Lecturas:     ${readings.length.toLocaleString()}
📄 Archivo:      ${outputPath}
==============================================
`);
