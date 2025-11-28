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

// Posición base
const LAT_START = 32.52570602900089;
const LON_START = -117.01766849875003;

// Dispositivos
// Parámetros de cobertura
const POINT_RADIUS_M = 18;      // radio de cobertura de cada punto (metros)
const RING_RADIUS_M = 25;       // radio del anillo (metros)

// Conversión aproximada metros <-> grados
const METERS_PER_DEG_LAT = 111_320; // aprox
function metersPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

// Desplazar una posición lat/lon una cierta distancia en metros y un ángulo (rad)
function offsetLatLon(
  lat0: number,
  lon0: number,
  distanceM: number,
  bearingRad: number
): { lat: number; lon: number } {
  const dLat = (distanceM * Math.cos(bearingRad)) / METERS_PER_DEG_LAT;
  const dLon = (distanceM * Math.sin(bearingRad)) / metersPerDegLon(lat0);

  return {
    lat: lat0 + dLat,
    lon: lon0 + dLon,
  };
}

// Definimos cuántos puntos necesita el anillo para no dejar huecos
const ringCircumference = 2 * Math.PI * RING_RADIUS_M;
const maxCenterSpacing = 2 * POINT_RADIUS_M; // 2R -> sin huecos
const NUM_POINTS = Math.ceil(ringCircumference / maxCenterSpacing);

// Rotamos cultivos alrededor del anillo
const cropsForRing: CropType[] = ["maiz", "trigo", "jitomate", "frijol"];

const devices: SeedDevice[] = Array.from({ length: NUM_POINTS }, (_, i) => {
  const angle = (2 * Math.PI * i) / NUM_POINTS; // de 0 a 2π
  const { lat, lon } = offsetLatLon(LAT_START, LON_START, RING_RADIUS_M, angle);

  return {
    esp32Id: `ESTACA-${(i + 2).toString().padStart(2, "0")}`,
    name: `Zona - ${String.fromCharCode(65 + i)}`, // Zona - A, B, C...
    latitude: lat,
    longitude: lon,
    crop: cropsForRing[i % cropsForRing.length],
  };
});


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
