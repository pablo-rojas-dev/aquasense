import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

import fetch from "node-fetch";
import * as cheerio from "cheerio";

import https from "https";
// TODO: investigar por que no funciona cargar el env con dotenv
//import dotenv from 'dotenv';
//dotenv.config();

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

// =======================
//  SMN / WEATHER SCRAPING
// =======================

const SMN_BASE_URL = "https://smn.conagua.gob.mx";
const SMN_HOME_URL = `${SMN_BASE_URL}/es/`;
const SMN_IMAGEN_INTERPRETADA_URL = `${SMN_BASE_URL}/es/pronosticos/pronosticossubmenu/imagen-interpretada`;
const SMN_AGRO_URL = `${SMN_BASE_URL}/es/pronosticos/pronosticossubmenu/reporte-meteorologico-para-la-agricultura`;

const smnInsecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Helper para pedir HTML
async function fetchHtml(url: string): Promise<string> {
  // Usar el agente "relajado" solo para el dominio del SMN
  const isSmnUrl = url.startsWith(SMN_BASE_URL);

  const res = await fetch(url, {
    // node-fetch v3 acepta un agent para http(s)
    // Si no es SMN, dejamos que use la config normal.
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
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("/")) return `${SMN_BASE_URL}${src}`;
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
    // fallback: recorta un poco el texto
    return text.trim().slice(0, 32) + (text.length > 32 ? "..." : "");
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
    const [homeHtml, climaHtml, agroHtml] = await Promise.all([
      fetchHtml(SMN_HOME_URL),
      fetchHtml(SMN_IMAGEN_INTERPRETADA_URL),
      fetchHtml(SMN_AGRO_URL),
    ]);

    // 1) Cintillo
    const $home = cheerio.load(homeHtml);
    const cintilloText = $home("#cintillo").text().replace(/\s+/g, " ").trim();

    // 2) Imagen interpretada
    const $clima = cheerio.load(climaHtml);
    const climaImg = $clima("img.Img_Estilo.Img_Centrar_Formu").first();
    const climaSrc = resolveImageUrl(climaImg.attr("src"));
    const climaAlt = climaImg.attr("alt") || "Imagen interpretada";

    // 3) Mapas de precipitación para cada 24 horas (5 días)
    const $agro = cheerio.load(agroHtml);
    const precipMaps: Array<{
      id: string;
      label: string;
      imageUrl: string;
      alt: string;
      rawDateText: string;
    }> = [];

    // Heurística: agarrar las imágenes de pronóstico diario (clase del ejemplo)
    $agro("img.Img_Estilo.img-responsive.img-max400").each((i, el) => {
      if (precipMaps.length >= 5) return false; // sólo 5 días

      const img = $agro(el);
      const src = resolveImageUrl(img.attr("src"));
      const alt = img.attr("alt") || "";

      // Buscar texto cercano que suele contener "Para el viernes, 21 de ..."
      let rawText = "";
      const parent = img.closest("p, div");
      if (parent && parent.length > 0) {
        rawText = parent.text().trim();
      }
      if (!rawText) {
        const prevP = img.parent().prevAll("p").first();
        if (prevP && prevP.length > 0) rawText = prevP.text().trim();
      }

      const label = buildTabLabelFromText(rawText || alt || `Día ${i + 1}`);

      precipMaps.push({
        id: `precip-${i + 1}`,
        label,
        imageUrl: src,
        alt: alt || label,
        rawDateText: rawText,
      });
    });

    res.json({
      cintillo: cintilloText,
      climaMap: {
        id: "clima",
        label: "Clima",
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