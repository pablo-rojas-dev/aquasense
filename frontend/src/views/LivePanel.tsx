import { useMemo } from "react";
import type { SensorReading, DeviceConfig, CropType } from "@/types";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from "recharts";

type LivePanelProps = {
  readings: SensorReading[];
  devices: DeviceConfig[];
};

type MoistureStateRange = {
  label: string;
  min: number;
  max: number;
};

// N° máximo de puntos en la gráfica en vivo
const MAX_POINTS = 60;

// Nombres legibles de cultivos
const cropLabel: Record<CropType, string> = {
  maiz: "Maíz",
  trigo: "Trigo",
  jitomate: "Jitomate",
  frijol: "Frijol",
};

// Rango de humedad según tabla del enunciado
function getMoistureStates(crop: CropType): MoistureStateRange[] {
  let irrigateBelowMin = 0;
  let idealMin = 0;
  let idealMax = 0;

  switch (crop) {
    case "maiz":
      // Rango ideal: 60–80 %, regar si baja de 50–55 %
      irrigateBelowMin = 50;
      idealMin = 60;
      idealMax = 80;
      break;
    case "trigo":
      // Rango ideal: 50–70 %, regar si baja de 40–45 %
      irrigateBelowMin = 40;
      idealMin = 50;
      idealMax = 70;
      break;
    case "jitomate":
      // Rango ideal: 65–85 %, regar si baja de 60–65 %
      irrigateBelowMin = 60;
      idealMin = 65;
      idealMax = 85;
      break;
    case "frijol":
      // Rango ideal: 55–75 %, regar si baja de 45–50 %
      irrigateBelowMin = 45;
      idealMin = 55;
      idealMax = 75;
      break;
  }

  return [
    {
      label: "Seco",
      min: 0,
      max: irrigateBelowMin,
    },
    {
      label: "Riego",
      min: irrigateBelowMin,
      max: idealMin,
    },
    {
      label: "Ideal",
      min: idealMin,
      max: idealMax,
    },
    {
      label: "Exceso",
      min: idealMax,
      max: 100,
    },
  ];
}

type ChartPoint = SensorReading & {
  timeLabel: string;
};

type DeviceLiveChartsProps = {
  device: DeviceConfig;
  readings: SensorReading[];
};

function DeviceLiveCharts({ device, readings }: DeviceLiveChartsProps) {
  const data: ChartPoint[] = useMemo(() => {
    const filtered = readings
      .filter((r) => r.id === device.id)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_POINTS);

    return filtered.map((r) => ({
      ...r,
      timeLabel: new Date(r.receivedAt).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    }));
  }, [device.id, readings]);

  const last = data[data.length - 1];
  const moistureStates = getMoistureStates(device.crop);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{device.name}</p>
          <p className="text-xs text-muted-foreground">
            Cultivo: {cropLabel[device.crop]} · Dispositivo: {device.id}
          </p>
        </div>

        {last && (
          <div className="text-xs md:text-sm text-right">
            <div>
              Temp:{" "}
              <span className="font-semibold">
                {last.temperature.toFixed(1)} °C
              </span>
            </div>
            <div>
              Humedad:{" "}
              <span className="font-semibold">
                {last.moisture.toFixed(0)} %
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Última lectura: {last.timeLabel}
            </div>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aún no hay lecturas para este dispositivo.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Gráfica de temperatura */}
          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Temperatura
              </CardTitle>
              <CardDescription className="text-xs">
                Línea de temperatura con área sombreada debajo
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timeLabel"
                      tick={{ fontSize: 10 }}
                      minTickGap={16}
                    />
                    <YAxis
                      unit="°C"
                      tick={{ fontSize: 10 }}
                      width={40}
                    />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "temperature"
                          ? [`${(value as number).toFixed(1)} °C`, "Temperatura"]
                          : [value, name]
                      }
                      labelFormatter={(label) => `Hora: ${label}`}
                    />
                    {/* Área bajo la curva (gráfico sigue siendo LineChart) */}
                    <ReferenceArea
                      y1={0}
                      y2={0}
                      // Sólo para mantener compatibilidad, el "relleno" lo hace la línea con strokeOpacity
                    />
                    <Line
                      type="monotone"
                      dataKey="temperature"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      // Simulación de área: aumentamos la opacidad por debajo de la línea
                      fill="hsl(var(--primary))"
                      fillOpacity={0.15}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Gráfica de humedad */}
          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Humedad del suelo
              </CardTitle>
              <CardDescription className="text-xs">
                Rangos de humedad según el cultivo ({cropLabel[device.crop]})
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timeLabel"
                      tick={{ fontSize: 10 }}
                      minTickGap={16}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 10 }}
                      width={40}
                    />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "moisture"
                          ? [`${(value as number).toFixed(0)} %`, "Humedad"]
                          : [value, name]
                      }
                      labelFormatter={(label) => `Hora: ${label}`}
                    />

                    {/* Áreas de referencia para cada estado: seco, riego, ideal, exceso */}
                    {moistureStates.map((state, index) => (
                      <ReferenceArea
                        key={state.label}
                        y1={state.min}
                        y2={state.max}
                        label={{
                          value: state.label,
                          position: "insideRight",
                          fill: "#374151",
                          fontSize: 10,
                        }}
                        fill={
                          index === 0
                            ? "#f97316"
                            : index === 1
                            ? "#eab308"
                            : index === 2
                            ? "#22c55e"
                            : "#38bdf8"
                        }
                        fillOpacity={0.05}
                        strokeOpacity={0}
                      />
                    ))}

                    <Line
                      type="monotone"
                      dataKey="moisture"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                <span className="font-semibold">Seco:</span> por debajo del
                umbral para regar ·{" "}
                <span className="font-semibold">Riego:</span> rango óptimo para
                iniciar riego ·{" "}
                <span className="font-semibold">Ideal:</span> rango de humedad
                ideal del cultivo ·{" "}
                <span className="font-semibold">Exceso:</span> por encima del
                rango ideal.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function LivePanel({ readings, devices }: LivePanelProps) {
  if (!devices.length) {
    return (
      <Card className="w-full max-w-5xl mx-auto bg-card border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            Panel en vivo
          </CardTitle>
          <CardDescription>
            No hay dispositivos configurados todavía.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configura al menos una ESP32 en el panel de riego para ver las
            lecturas en vivo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const defaultId = devices[0]?.id;

  return (
    <Card className="w-full max-w-6xl mx-auto bg-card border border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          Panel en vivo
        </CardTitle>
        <CardDescription>
          Datos de temperatura y humedad transmitidos en vivo por las ESP32.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultId} className="w-full">
          <TabsList className="mb-4 flex flex-wrap gap-2">
            {devices.map((device) => (
              <TabsTrigger
                key={device.id}
                value={device.id}
                className="text-xs md:text-sm"
              >
                {device.id}
              </TabsTrigger>
            ))}
          </TabsList>

          {devices.map((device) => (
            <TabsContent key={device.id} value={device.id}>
              <DeviceLiveCharts device={device} readings={readings} />
            </TabsContent>
          ))}
        </Tabs>

        <p className="mt-4 text-xs text-muted-foreground">
          Los datos se actualizan automáticamente cada 2 segundos desde las
          lecturas del backend.
        </p>
      </CardContent>
    </Card>
  );
}
