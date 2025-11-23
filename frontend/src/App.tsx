import { useEffect, useState } from "react";
import type { SensorReading } from"./types";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import TemperatureView from "./views/TemperatureView";
import MoistureView from "./views/MoistureView";

const API_BASE_URL = "http://localhost:4000";

function App() {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReadings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/readings?limit=100`);
        const data: SensorReading[] = await res.json();
        setReadings(data);
        setLoading(false);
      } catch (error) {
        console.error("Error obteniendo lecturas:", error);
        setLoading(false);
      }
    };

    fetchReadings();
    const intervalId = window.setInterval(fetchReadings, 2000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <Card className="w-full max-w-5xl bg-card border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            Monitor de Sensores ESP32 (Bluetooth SPP)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              Cargando lecturas...
            </div>
          ) : (
            <Tabs defaultValue="temperature" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="temperature">Temperatura</TabsTrigger>
                <TabsTrigger value="moisture">Humedad del suelo</TabsTrigger>
              </TabsList>

              <TabsContent value="temperature">
                <TemperatureView readings={readings} />
              </TabsContent>

              <TabsContent value="moisture">
                <MoistureView readings={readings} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
