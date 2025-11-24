import { useEffect, useState } from "react";
import type { WeatherReport } from "@/types";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface WeatherReportViewProps {
  apiBaseUrl: string;
}

function WeatherReportView({ apiBaseUrl }: WeatherReportViewProps) {
  const [data, setData] = useState<WeatherReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clima");

  useEffect(() => {
    const fetchWeatherReport = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${apiBaseUrl}/api/weather-report`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json: WeatherReport = await res.json();
        setData(json);

        // Por defecto mostrar primer mapa de precipitación si existe
        if (json.precipMaps && json.precipMaps.length > 0) {
          setActiveTab("clima");
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo obtener la información meteorológica.");
      } finally {
        setLoading(false);
      }
    };

    fetchWeatherReport();
  }, [apiBaseUrl]);

  if (loading) {
    return (
      <Card className="w-full max-w-5xl mx-auto bg-card border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            Reporte meteorológico del SMN
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-6 w-64 bg-muted rounded animate-pulse mb-4" />
          <div className="h-80 bg-muted rounded-xl animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full max-w-3xl mx-auto bg-card border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            Reporte meteorológico del SMN
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive mb-2">{error}</p>
          <p className="text-xs text-muted-foreground">
            Verifica que el servidor backend tenga acceso a{" "}
            <span className="font-mono text-[0.7rem]">
              smn.conagua.gob.mx
            </span>{" "}
            y que el endpoint <strong>/api/weather-report</strong> esté
            configurado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { cintillo, climaMap, precipMaps, lastUpdated } = data;

  return (
    <Card className="w-full max-w-6xl mx-auto bg-card border border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          Reporte meteorológico del SMN
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Cintillo */}
        <div className="rounded-md border bg-muted px-3 py-2 text-xs leading-relaxed max-h-24 overflow-y-auto">
          {cintillo || "Sin información de cintillo disponible."}
        </div>

        <Separator />

        {/* Mapas */}
        <div className="space-y-3">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-muted/40">
              <TabsList className="flex w-max px-2">
                <TabsTrigger value="clima" className="px-4">
                  {climaMap.label ?? "Clima"}
                </TabsTrigger>

                {precipMaps.map((m) => (
                  <TabsTrigger key={m.id} value={m.id} className="px-4">
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollArea>

            {/* Mapa 1: Imagen interpretada */}
            <TabsContent value="clima" className="mt-4">
              <div className="flex justify-center">
                <div className="bg-white border border-border rounded-2xl shadow-sm p-3">
                  <img
                    src={climaMap.imageUrl}
                    alt={climaMap.alt || "Mapa de clima"}
                    className="max-h-[520px] w-auto object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Mapas 2–6: Precipitación */}
            {precipMaps.map((m) => (
              <TabsContent key={m.id} value={m.id} className="mt-4">
                <div className="flex flex-col gap-3">
                  {m.rawDateText && (
                    <p className="text-xs text-muted-foreground">
                      {m.rawDateText}
                    </p>
                  )}

                  <div className="flex justify-center">
                    <div className="bg-white border border-border rounded-2xl shadow-sm p-3">
                      <img
                        src={m.imageUrl}
                        alt={m.alt || m.label}
                        className="max-h-[520px] w-auto object-contain"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
          <span>
            Fuente: Servicio Meteorológico Nacional (CONAGUA) — Datos obtenidos
            vía scraping desde{" "}
            <span className="font-mono text-[0.7rem]">
              smn.conagua.gob.mx
            </span>
            .
          </span>
          {lastUpdated && (
            <span>
              Última actualización:{" "}
              {new Date(lastUpdated).toLocaleString("es-MX")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default WeatherReportView;
