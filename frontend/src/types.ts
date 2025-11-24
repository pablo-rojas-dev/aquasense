export type CropType = "maiz" | "trigo" | "jitomate" | "frijol";

export interface SensorReading {
  id: string;          // ID de la ESP32 (ej: "ESP32-01")
  timestamp: number;   // timestamp de la ESP32 (ms)
  temperature: number; // °C
  moisture: number;    // %
  receivedAt: string;  // fecha/hora en el backend (ISO)
}

export interface DeviceConfig {
  id: string;        // ID de la ESP32
  name: string;      // Nombre de la zona
  latitude: number;
  longitude: number;
  crop: CropType;
}

export type IrrigationStatus = "seco" | "riego" | "ideal" | "exceso";

export interface DeviceWithLastReading extends DeviceConfig {
  lastReading?: SensorReading;
}

// Tabla de rangos de humedad por cultivo
export const humidityRanges: Record<
  CropType,
  {
    idealMin: number;
    idealMax: number;
    irrigateMin: number; // Por debajo de esto se considera "seco"
  }
> = {
  maiz: {
    idealMin: 60,
    idealMax: 80,
    irrigateMin: 50, // "Regar si baja de 50–55 %"
  },
  trigo: {
    idealMin: 50,
    idealMax: 70,
    irrigateMin: 40, // "Regar si baja de 40–45 %"
  },
  jitomate: {
    idealMin: 65,
    idealMax: 85,
    irrigateMin: 60, // "Regar si baja de 60–65 %"
  },
  frijol: {
    idealMin: 55,
    idealMax: 75,
    irrigateMin: 45, // "Regar si baja de 45–50 %"
  },
};

// Calcula el estado de riego según cultivo y humedad
export function computeIrrigationStatus(
  crop: CropType,
  moisture: number
): IrrigationStatus {
  const cfg = humidityRanges[crop];

  if (moisture < cfg.irrigateMin) {
    return "seco";
  }

  if (moisture < cfg.idealMin) {
    return "riego";
  }

  if (moisture <= cfg.idealMax) {
    return "ideal";
  }

  return "exceso";
}

// El progress se puede interpretar directamente como % de humedad del suelo
export function computeIrrigationProgress(moisture: number): number {
  const clamped = Math.max(0, Math.min(100, moisture));
  return clamped;
}

export interface WeatherMap {
  id: string;
  label: string;
  imageUrl: string;
  alt?: string;
  rawDateText?: string;
}

export interface WeatherReport {
  cintillo: string;
  cintilloHtml?: string;
  climaMap: {
    id: string;
    label: string;
    imageUrl: string;
    alt: string;
    rawDateText: string;
  };
  precipMaps: Array<{
    id: string;
    label: string;
    imageUrl: string;
    alt: string;
    rawDateText: string;
  }>;
  lastUpdated: string;
}

