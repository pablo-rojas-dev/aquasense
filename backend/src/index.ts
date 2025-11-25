import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

import fetch from "node-fetch";
import * as cheerio from "cheerio";

import https from "https";
import axios from "axios";

import fs from "fs";
import path from "path";

// TODO: investigar por que no funciona cargar el env con dotenv
// import dotenv from "dotenv";
// dotenv.config();

type CropType = null | "maiz" | "trigo" | "jitomate" | "frijol";

interface SensorReading {
  id: string;
  timestamp: number; // timestamp enviado por la ESP32
  temperature: number; // °C
  moisture: number; // %
  receivedAt: string; // ISO en el backend
}

interface DeviceConfig {
  id: string; // ID de la ESP32 (ej: ESP32-01)
  name: string; // Nombre de la zona
  latitude: number;
  longitude: number;
  crop: CropType;
}

// Seed data interfaces (para generar datos de prueba)
interface SeedDevice {
  esp32Id: string;
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

const readings: SensorReading[] = [];
const devices: DeviceConfig[] = [];

const SEED_FILE_PATH =
  process.env.SEED_FILE_PATH ||
  path.join(__dirname, "..", "test-data.json");

function loadSeedData() {
  try {
    if (!fs.existsSync(SEED_FILE_PATH)) {
      console.warn(
        "[seed] No se encontró test-data.json, iniciando con DB vacía.",
        SEED_FILE_PATH
      );
      return;
    }

    const raw = fs.readFileSync(SEED_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SeedFile;

    if (Array.isArray(parsed.devices)) {
      parsed.devices.forEach((sd) => {
        // Evitar duplicados por si recargan en caliente
        if (devices.some((d) => d.id === sd.esp32Id)) return;

        const device: DeviceConfig = {
          id: sd.esp32Id,
          name: sd.name,
          latitude: Number(sd.latitude),
          longitude: Number(sd.longitude),
          crop: sd.crop,
        };
        devices.push(device);
      });
    }

    if (Array.isArray(parsed.readings)) {
      parsed.readings.forEach((sr) => {
        // Evitar crecer infinito si ya hay datos
        if (readings.length > 5000) return;

        const reading: SensorReading = {
          id: sr.id,
          timestamp: sr.timestamp,
          temperature: sr.temperature,
          moisture: sr.moisture,
          // Para datos históricos usamos el timestamp del sensor
          receivedAt: new Date(sr.timestamp).toISOString(),
        };
        readings.push(reading);
      });
    }

    console.log(
      `[seed] Cargados ${devices.length} dispositivos y ${readings.length} lecturas desde test-data.json`
    );
  } catch (err) {
    console.error("[seed] Error cargando test-data.json:", err);
  }
}

loadSeedData();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const HTTP_PORT = Number(process.env.PORT) || 4000;

// =======================
//  SMN / WEATHER SCRAPING
// =======================

const SMN_BASE_URL = "https://smn.conagua.gob.mx";
const SMN_IMAGEN_INTERPRETADA_URL = `${SMN_BASE_URL}/es/pronosticos/pronosticossubmenu/imagen-interpretada`;
const SMN_AGRO_URL = `${SMN_BASE_URL}/es/pronosticos/pronosticossubmenu/reporte-meteorologico-para-la-agricultura`;
const SMN_CINTILLO_URL = `${SMN_BASE_URL}/tools/PHP/bannerAvisos.php`;

const smnInsecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Helper para pedir HTML
async function fetchHtml(url: string): Promise<string> {
  const isSmnUrl = url.startsWith(SMN_BASE_URL);

  const res = await fetch(url, {
    agent: isSmnUrl ? smnInsecureAgent : undefined,
  } as any);

  if (!res.ok) {
    throw new Error(`Error al obtener ${url}: ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

// Helper para normalizar URLs de imágenes
function resolveImageUrl(src: string | undefined | null): string {
  if (!src) return "";

  // Normalizar URLs absolutas del SMN
  if (src.startsWith("http://")) {
    // Fuerza siempre https
    return src.replace(/^http:\/\//, "https://");
  }

  if (src.startsWith("https://")) return src;

  // Rutas absolutas del sitio (empiezan con "/")
  if (src.startsWith("/")) return `${SMN_BASE_URL}${src}`;

  // Rutas relativas
  return `${SMN_BASE_URL}/${src}`;
}

// Helper para construir etiqueta del tab a partir del texto descriptivo
function buildTabLabelFromText(text: string): string {
  // Esperamos algo tipo: "Para el viernes, 21 de noviembre de 2025 (GFS)"
  const months: Record<string, string> = {
    enero: "ene",
    febrero: "feb",
    marzo: "mar",
    abril: "abr",
    mayo: "may",
    junio: "jun",
    julio: "jul",
    agosto: "ago",
    septiembre: "sep",
    setiembre: "sep",
    octubre: "oct",
    noviembre: "nov",
    diciembre: "dic",
  };

  const regex =
    /para el\s+([a-záéíóúñ]+)[,]?\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i;

  const match = text.match(regex);
  if (!match) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    return trimmed.slice(0, 32) + (trimmed.length > 32 ? "..." : "");
  }

  const [, diaSemanaRaw, diaRaw, mesRaw, anioRaw] = match;
  const diaSemana =
    diaSemanaRaw.charAt(0).toUpperCase() +
    diaSemanaRaw.slice(1).toLowerCase();
  const dia = diaRaw;
  const mesKey = mesRaw.toLowerCase();
  const mesCorto = months[mesKey] ?? mesKey.slice(0, 3);

  return `${diaSemana}-${dia}/${mesCorto}/${anioRaw}`;
}

// Endpoint para reporte meteorológico del SMN
app.get("/api/weather-report", async (_req, res) => {
  try {
    // 1) Cintillo: pedimos DIRECTAMENTE lo que pide el JS del sitio
    let cintilloText = "";

    try {
      const cintilloHtmlRaw = await fetchHtml(SMN_CINTILLO_URL);

      // Lo envolvemos para poder parsearlo con cheerio
      const $cintillo = cheerio.load(`<div>${cintilloHtmlRaw}</div>`);

      const linkTexts = $cintillo("a")
        .map((i, el) =>
          $cintillo(el).text().replace(/\s+/g, " ").trim()
        )
        .get()
        .filter(Boolean);

      cintilloText =
        linkTexts.join(" --- ") ||
        $cintillo("div").text().replace(/\s+/g, " ").trim();
    } catch (cintilloErr) {
      console.error("Error obteniendo cintillo:", cintilloErr);
      cintilloText = "";
    }

    // 2) Imagen interpretada + 3) Mapas agro
    const [climaHtml, agroHtml] = await Promise.all([
      fetchHtml(SMN_IMAGEN_INTERPRETADA_URL),
      fetchHtml(SMN_AGRO_URL),
    ]);

    // 2) Imagen interpretada
    const $clima = cheerio.load(climaHtml);
    const climaImg = $clima("img.Img_Estilo.Img_Centrar_Formu").first();
    const climaSrc = resolveImageUrl(climaImg.attr("src"));
    const climaAlt = climaImg.attr("alt") || "Imagen interpretada";

    // 3) Mapas de la página de agricultura (índices específicos)
    const $agro = cheerio.load(agroHtml);
    const precipMaps: Array<{
      id: string;
      label: string;
      imageUrl: string;
      alt: string;
      rawDateText: string;
    }> = [];

    const desiredConfigs: { domIndex: number; label: string }[] = [
      { domIndex: 1, label: "Precipitación (Hoy)" },
      { domIndex: 9, label: "Presas (Semana)" },
      { domIndex: 13, label: "Precipitación (Mes)" },
      { domIndex: 17, label: "Temperatura Max" },
      { domIndex: 18, label: "Temperatura Min" },
    ];

    const desiredIndexMap = new Map<number, { label: string; order: number }>();
    desiredConfigs.forEach((cfg, idx) => {
      desiredIndexMap.set(cfg.domIndex, { label: cfg.label, order: idx + 1 });
    });

    $agro("img.Img_Estilo.img-responsive.img-max400").each((i, el) => {
      const domIndex = i + 1; // i es 0-based, nosotros contamos 1-based
      const cfg = desiredIndexMap.get(domIndex);
      if (!cfg) return; // no es uno de los que queremos

      const img = $agro(el);
      const src = resolveImageUrl(img.attr("src"));
      const alt = img.attr("alt") || cfg.label;

      // Buscar texto cercano (por si quieres mostrar la descripción original)
      let rawText = "";
      const parent = img.closest("p, div");
      if (parent && parent.length > 0) {
        rawText = parent.text().trim();
      }
      if (!rawText) {
        const prevP = img.parent().prevAll("p").first();
        if (prevP && prevP.length > 0) rawText = prevP.text().trim();
      }

      precipMaps.push({
        id: `map-${cfg.order}`,   // map-1, map-2, etc.
        label: cfg.label,         // etiqueta fija según lo que pediste
        imageUrl: src,
        alt,
        rawDateText: rawText,
      });
    });

    res.json({
      cintillo: cintilloText,
      climaMap: {
        id: "clima",
        label: "Clima (Hoy)",
        imageUrl: climaSrc,
        alt: climaAlt,
        rawDateText: "",
      },
      precipMaps,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error obteniendo reporte meteorológico:", error);
    res.status(500).json({
      error: "No se pudo obtener el reporte meteorológico del SMN.",
    });
  }
});

// =======================
//   SERIAL / BLUETOOTH
// =======================

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

    // 🚀 Solo detectamos el nuevo ID, pero NO lo metemos en `devices`
    const yaConocidoComoLectura = readings.some(
      (r) => r.id === parsed.id
    );
    const yaConocidoComoZona = devices.some(
      (d) => d.id === parsed.id
    );

    if (!yaConocidoComoLectura && !yaConocidoComoZona) {
      console.log("Nuevo dispositivo detectado desde Serial:", parsed.id);
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

// ===============
//  ENDPOINTS API
// ===============
// Agent que no verifica el certificado SSL (para el SMN)
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

app.get("/api/weather-image", async (req, res) => {
  try {
    const url = req.query.url as string | undefined;
    if (!url) {
      return res.status(400).send("Missing url param");
    }

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      httpsAgent: insecureAgent,
    });

    const contentType =
      (response.headers["content-type"] as string | undefined) ||
      "image/jpeg";

    res.setHeader("Content-Type", contentType);
    res.send(response.data);
  } catch (err) {
    console.error("Error fetching weather image:", err);
    res.status(500).send("Error fetching image");
  }
});

app.get("/api/device-ids", (_req, res) => {
  // IDs de zonas configuradas + IDs vistos en lecturas
  const ids = Array.from(
    new Set([
      ...devices.map((d) => d.id),
      ...readings.map((r) => r.id),
    ])
  );
  res.json(ids);
});

// Lecturas recientes
app.get("/api/readings", (req, res) => {
  const limit = Number(req.query.limit) || readings.length;

  // Ordenamos por receivedAt (lo que marca realmente cuándo llegó al backend)
  const sorted = [...readings].sort(
    (a, b) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  // Devolvemos las N lecturas más recientes (seed + en vivo)
  res.json(sorted.slice(0, limit));
});

// Listado de dispositivos / zonas
app.get("/api/devices", (_req, res) => {
  res.json(devices);
});

// Crear nueva zona / dispositivo
app.post("/api/devices", (req, res) => {
  const { id, name, latitude, longitude, crop } =
    req.body as Partial<DeviceConfig>;

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
  const { name, latitude, longitude, crop } =
    req.body as Partial<DeviceConfig>;

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
