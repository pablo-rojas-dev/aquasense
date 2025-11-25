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
  id: string;        // esp32Id
  timestamp: number; // ms desde epoch
  temperature: number;
  moisture: number;
}

interface SeedFile {
  devices: SeedDevice[];
  readings: SeedReading[];
}

/* ==================
   🔧 CONFIGURACIÓN
   ================== */

// Inicio fijo: 01/01/2025 a las 00:00 (hora local del sistema)
const START_DATE = new Date(2025, 0, 1); // 0 = enero

// Hoy (sólo parte de fecha, sin hora)
const today = new Date();
const NOW_DATE = new Date(today.getFullYear(), today.getMonth(), today.getDate());

// 2 lecturas por día (ejemplo: 08:00 y 16:00)
const READING_HOURS = [8, 16];

// Posición base (ejemplo CDMX)
const LAT_START = 19.4326;
const LON_START = -99.1332;

// Dispositivos (similar a tu test-data actual)
const devices: SeedDevice[] = [
  {
    esp32Id: "ESP32-02",
    name: "Zona - B",
    latitude: LAT_START,
    longitude: LON_START,
    crop: "maiz",
  },
  {
    esp32Id: "ESP32-03",
    name: "Zona - C",
    latitude: LAT_START + 0.001,
    longitude: LON_START + 0.001,
    crop: "trigo",
  },
  {
    esp32Id: "ESP32-04",
    name: "Zona - D",
    latitude: LAT_START + 0.002,
    longitude: LON_START + 0.002,
    crop: "jitomate",
  },
  {
    esp32Id: "ESP32-05",
    name: "Zona - E",
    latitude: LAT_START + 0.003,
    longitude: LON_START + 0.003,
    crop: "frijol",
  },
  {
    esp32Id: "ESP32-06",
    name: "Zona - F",
    latitude: LAT_START + 0.004,
    longitude: LON_START + 0.004,
    crop: "maiz",
  },
  {
    esp32Id: "ESP32-07",
    name: "Zona - G",
    latitude: LAT_START + 0.005,
    longitude: LON_START + 0.005,
    crop: "trigo",
  },
  {
    esp32Id: "ESP32-08",
    name: "Zona - H",
    latitude: LAT_START + 0.006,
    longitude: LON_START + 0.006,
    crop: "jitomate",
  },
  {
    esp32Id: "ESP32-09",
    name: "Zona - I",
    latitude: LAT_START + 0.007,
    longitude: LON_START + 0.007,
    crop: "frijol",
  },
  {
    esp32Id: "ESP32-10",
    name: "Zona - J",
    latitude: LAT_START + 0.008,
    longitude: LON_START + 0.008,
    crop: "maiz",
  },
];

/* ==================
   🔢 UTILIDADES
   ================== */

// Pequeño PRNG para que no sea totalmente random en cada ejecución (opcional)
let seed = 123456;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 0xffffffff;
  return seed / 0xffffffff;
}

function randomInRange(min: number, max: number): number {
  return min + (max - min) * rand();
}

// Día del año (0–365) para meter un poco de estacionalidad
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/* ==================
   🌡️ GENERACIÓN DE LECTURAS
   ================== */

const readings: SeedReading[] = [];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

for (
  let dayStart = new Date(START_DATE.getTime());
  dayStart <= NOW_DATE;
  dayStart = new Date(dayStart.getTime() + ONE_DAY_MS)
) {
  const doy = dayOfYear(dayStart);

  // Componente estacional (ejemplo: veranos más calurosos)
  const seasonalTemp = 22 + 6 * Math.sin((2 * Math.PI * doy) / 365);
  const seasonalMoist = 45 + 10 * Math.cos((2 * Math.PI * doy) / 365);

  for (const device of devices) {
    // Ajuste por cultivo
    let cropTempOffset = 0;
    let cropMoistOffset = 0;

    switch (device.crop) {
      case "maiz":
        cropTempOffset = 1;
        cropMoistOffset = 5;
        break;
      case "trigo":
        cropTempOffset = -1;
        cropMoistOffset = 3;
        break;
      case "jitomate":
        cropTempOffset = 2;
        cropMoistOffset = -2;
        break;
      case "frijol":
        cropTempOffset = 0.5;
        cropMoistOffset = 1;
        break;
    }

    for (const hour of READING_HOURS) {
      const readingDate = new Date(
        dayStart.getFullYear(),
        dayStart.getMonth(),
        dayStart.getDate(),
        hour,
        0,
        0,
        0
      );

      const baseTemp = seasonalTemp + cropTempOffset;
      const baseMoist = seasonalMoist + cropMoistOffset;

      const temperature =
        baseTemp +
        randomInRange(-1.5, 1.5); // ruido suave

      const moisture =
        baseMoist +
        randomInRange(-4, 4); // ruido suave

      readings.push({
        id: device.esp32Id,
        timestamp: readingDate.getTime(),
        temperature: Number(temperature.toFixed(2)),
        moisture: Number(moisture.toFixed(2)),
      });
    }
  }
}

/* ==================
   💾 EXPORTAR JSON
   ================== */

const seedFile: SeedFile = { devices, readings };

const outputPath = path.join(process.cwd(), "test-data.json");
fs.writeFileSync(outputPath, JSON.stringify(seedFile, null, 2), "utf8");

console.log(`
===================== OK =====================
Datos de prueba generados 🎉
📌 Dispositivos: ${devices.length}
📌 Lecturas:     ${readings.length.toLocaleString()}
📄 Archivo:      ${outputPath}
==============================================
`);
