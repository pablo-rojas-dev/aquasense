import { useMemo } from "react";
import type { SensorReading } from "@/types";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type ReportsViewProps = {
  readings: SensorReading[];
};

type RangeKey = "week" | "month" | "year";

type AggregatedPoint = {
  label: string;
  timestamp: number;
  temperature: number;
  moisture: number;
};

type BucketInfo = {
  key: string;
  label: string;
  bucketTime: number;
};

function getBucketInfo(date: Date, range: RangeKey): BucketInfo {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (range === "year") {
    const bucketDate = new Date(year, month, 1);
    const monthLabel = bucketDate.toLocaleDateString("es-MX", {
      month: "short",
    });
    return {
      key: `${year}-${month}`,
      label: `${monthLabel} ${String(year).slice(-2)}`,
      bucketTime: bucketDate.getTime(),
    };
  }

  // Semana y mes: agrupamos por día (inicio de día)
  const bucketDate = new Date(year, month, day);
  const label =
    range === "week"
      ? bucketDate.toLocaleDateString("es-MX", {
          weekday: "short",
          day: "2-digit",
        })
      : bucketDate
          .toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
          })
          .replace(".", "");

  return {
    key: `${year}-${month}-${day}`,
    label,
    bucketTime: bucketDate.getTime(),
  };
}

function buildAggregatedData(
  readings: SensorReading[],
  range: RangeKey
): AggregatedPoint[] {
  const dayMs = 24 * 60 * 60 * 1000;

  // 1) Nos quedamos solo con lecturas con timestamp válido
  const valid = readings.filter(
    (r) => typeof r.timestamp === "number" && r.timestamp > 0
  );
  if (!valid.length) return [];

  // 2) Calculamos el rango temporal en base a los datos (histórico)
  const timestamps = valid.map((r) => r.timestamp as number);
  const maxTs = Math.max(...timestamps); // lectura más reciente
  const minTs = Math.min(...timestamps); // lectura más antigua

  let windowMs: number | null = null;

  if (range === "week") windowMs = 7 * dayMs;
  if (range === "month") windowMs = 30 * dayMs;
  if (range === "year") windowMs = 365 * dayMs;

  const start = windowMs ? Math.max(maxTs - windowMs, minTs) : minTs;

  // 3) Agregamos en buckets (igual que antes)
  const buckets = new Map<
    string,
    {
      label: string;
      timestamp: number;
      sumTemp: number;
      sumMoist: number;
      count: number;
    }
  >();

  for (const r of valid) {
    const ts = r.timestamp as number;
    if (ts < start || ts > maxTs) continue;

    const date = new Date(ts);
    const { key, label, bucketTime } = getBucketInfo(date, range);

    const bucket =
      buckets.get(key) ??
      {
        label,
        timestamp: bucketTime,
        sumTemp: 0,
        sumMoist: 0,
        count: 0,
      };

    const t = typeof r.temperature === "number" ? r.temperature : 0;
    const m = typeof r.moisture === "number" ? r.moisture : 0;

    bucket.sumTemp += t;
    bucket.sumMoist += m;
    bucket.count += 1;

    buckets.set(key, bucket);
  }

  const points: AggregatedPoint[] = Array.from(buckets.values())
    .map((b) => ({
      label: b.label,
      timestamp: b.timestamp,
      temperature: b.count ? b.sumTemp / b.count : 0,
      moisture: b.count ? b.sumMoist / b.count : 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return points;
}

type RangeConfig = {
  key: RangeKey;
  label: string;
  description: string;
};

const ranges: RangeConfig[] = [
  {
    key: "week",
    label: "Semana",
    description: "Promedio diario de los últimos 7 días",
  },
  {
    key: "month",
    label: "Mes",
    description: "Promedio diario de los últimos 30 días",
  },
  {
    key: "year",
    label: "Año",
    description: "Promedio mensual del último año",
  },
];

function RangeCharts({
  range,
  readings,
}: {
  range: RangeKey;
  readings: SensorReading[];
}) {
  const data = useMemo(
    () => buildAggregatedData(readings, range),
    [readings, range]
  );

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No hay suficientes datos para este rango de tiempo.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Temperatura */}
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Temperatura promedio
            </CardTitle>
            <CardDescription className="text-xs">
              Promedio de temperatura de todas las ESP32 ({ranges.find((r) => r.key === range)?.description})
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    minTickGap={16}
                  />
                  <YAxis unit="°C" tick={{ fontSize: 10 }} width={40} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "temperature"
                        ? [`${(value as number).toFixed(1)} °C`, "Temperatura"]
                        : [value, name]
                    }
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    name="Temperatura"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Humedad */}
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Humedad promedio del suelo
            </CardTitle>
            <CardDescription className="text-xs">
              Promedio de humedad de todas las ESP32 ({ranges.find((r) => r.key === range)?.description})
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    minTickGap={16}
                  />
                  <YAxis
                    unit="%"
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "moisture"
                        ? [`${(value as number).toFixed(0)} %`, "Humedad"]
                        : [value, name]
                    }
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="moisture"
                    name="Humedad"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <p className="text-xs text-muted-foreground leading-relaxed">
        Estos reportes promedian las lecturas de <span className="font-semibold">todas</span> las ESP32
        registradas en el sistema dentro del rango seleccionado (semana, mes o año).
        Los valores se muestran de izquierda a derecha en orden cronológico.
      </p>
    </div>
  );
}

export default function ReportsView({ readings }: ReportsViewProps) {
  return (
    <Card className="w-full max-w-6xl mx-auto bg-card border border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          Reportes de temperatura y humedad
        </CardTitle>
        <CardDescription>
          Promedios de temperatura y humedad del suelo agregados por periodo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="week" className="w-full">
          <TabsList className="mb-4 flex flex-wrap gap-2">
            <TabsTrigger value="week" className="text-xs md:text-sm">
              Semana
            </TabsTrigger>
            <TabsTrigger value="month" className="text-xs md:text-sm">
              Mes
            </TabsTrigger>
            <TabsTrigger value="year" className="text-xs md:text-sm">
              Año
            </TabsTrigger>
          </TabsList>

          <TabsContent value="week">
            <RangeCharts range="week" readings={readings} />
          </TabsContent>

          <TabsContent value="month">
            <RangeCharts range="month" readings={readings} />
          </TabsContent>

          <TabsContent value="year">
            <RangeCharts range="year" readings={readings} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
