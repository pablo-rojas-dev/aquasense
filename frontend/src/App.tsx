import { useEffect, useMemo, useState } from "react";
import type {
  SensorReading,
  DeviceConfig,
  DeviceWithLastReading,
} from "./types";

import IrrigationPanel from "@/views/IrrigationPanel";
import TemperatureView from "./views/TemperatureView";
import MoistureView from "./views/MoistureView";
import WeatherReportView from "./views/WeatherReportView";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { Menu } from "lucide-react";

const API_BASE_URL = "http://localhost:4000";

type Page = "irrigation" | "history" | "weather";

function App() {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [devices, setDevices] = useState<DeviceConfig[]>([]);
  const [loadingReadings, setLoadingReadings] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [page, setPage] = useState<Page>("irrigation");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Fetch lecturas ---
  useEffect(() => {
    const fetchReadings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/readings?limit=500`);
        const data: SensorReading[] = await res.json();
        setReadings(data);
      } catch (error) {
        console.error("Error obteniendo lecturas:", error);
      } finally {
        setLoadingReadings(false);
      }
    };

    fetchReadings();
    const intervalId = window.setInterval(fetchReadings, 2000);

    return () => window.clearInterval(intervalId);
  }, []);

  // --- Fetch dispositivos / zonas ---
  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/devices`);
      const data: DeviceConfig[] = await res.json();
      setDevices(data);
    } catch (error) {
      console.error("Error obteniendo dispositivos:", error);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // IDs disponibles de lecturas para usarlos en el formulario (Select)
  const availableIds = useMemo(
    () => Array.from(new Set(readings.map((r) => r.id))).sort(),
    [readings]
  );

  // Mezclar devices + última lectura por id
  const zones: DeviceWithLastReading[] = useMemo(() => {
    const lastById = new Map<string, SensorReading>();

    for (const r of readings) {
      const current = lastById.get(r.id);
      if (!current || r.timestamp > current.timestamp) {
        lastById.set(r.id, r);
      }
    }

    return devices.map((d) => ({
      ...d,
      lastReading: lastById.get(d.id),
    }));
  }, [devices, readings]);

  const loading = loadingReadings || loadingDevices;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between md:justify-start gap-2">
            <span className="font-semibold text-lg">
              AquaSense Dashboard
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              ✕
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <nav className="py-4 space-y-1">
              <button
                className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                  page === "irrigation"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => setPage("irrigation")}
              >
                Panel de riego
              </button>

              <button
                className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                  page === "history"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => setPage("history")}
              >
                Historial (gráficas)
              </button>

              <button
                className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                  page === "weather"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => setPage("weather")}
              >
                Reporte meteorológico
              </button>
            </nav>
          </ScrollArea>

          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            ESP32 · React+Vite · shadcn/ui · Recharts
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-4 md:px-6 py-3 border-b border-border flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">
              {page === "irrigation"
                ? "Panel de riego"
                : page === "history"
                ? "Historial de lecturas"
                : "Reporte meteorológico del SMN"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {page === "weather"
                ? "Datos en vivo desde el Servicio Meteorológico Nacional de México"
                : "Sensores ESP32 vía Bluetooth SPP"}
            </p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              Cargando datos...
            </div>
          ) : page === "irrigation" ? (
            <IrrigationPanel
              apiBaseUrl={API_BASE_URL}
              zones={zones}
              availableIds={availableIds}
              onZoneSaved={fetchDevices}
            />
          ) : page === "history" ? (
            <Card className="w-full max-w-5xl mx-auto bg-card border border-border">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">
                  Historial de sensores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="temperature" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="temperature">
                      Temperatura
                    </TabsTrigger>
                    <TabsTrigger value="moisture">
                      Humedad del suelo
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="temperature">
                    <TemperatureView readings={readings} />
                  </TabsContent>

                  <TabsContent value="moisture">
                    <MoistureView readings={readings} />
                  </TabsContent>
                </Tabs>

                <Separator className="my-4" />

                <p className="text-xs text-muted-foreground">
                  Los datos se actualizan automáticamente cada 2 segundos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <WeatherReportView apiBaseUrl={API_BASE_URL} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
