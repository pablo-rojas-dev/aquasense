import React, { useEffect, useMemo, useState } from "react";
import type {
  DeviceWithLastReading,
  IrrigationStatus,
  CropType,
} from "../types";
import {
  computeIrrigationStatus,
  computeIrrigationProgress,
} from "../types";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  Droplet,
  Thermometer,
  Settings,
  Plus,
  Leaf,
} from "lucide-react";

interface IrrigationPanelProps {
  apiBaseUrl: string;
  zones: DeviceWithLastReading[];
  availableIds: string[];
  onZoneSaved?: () => void;
}

type SheetMode = "create" | "edit";

interface ZoneFormState {
  esp32Id: string;
  name: string;
  latitude: string;
  longitude: string;
  crop: CropType | "";
}

const STATUS_COLORS: Record<
  IrrigationStatus,
  { badge: string; progress: string; mapSolid: string; mapSoft: string }
> = {
  seco: {
    badge: "bg-red-100 text-red-800 border border-red-200",
    progress: "bg-red-100",
    mapSolid: "bg-red-500",
    mapSoft: "bg-red-500/20 border-red-500/40",
  },
  riego: {
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    progress: "bg-yellow-100",
    mapSolid: "bg-yellow-500",
    mapSoft: "bg-yellow-500/20 border-yellow-500/40",
  },
  ideal: {
    badge: "bg-blue-100 text-blue-800 border border-blue-200",
    progress: "bg-blue-100",
    mapSolid: "bg-blue-500",
    mapSoft: "bg-blue-500/20 border-blue-500/40",
  },
  exceso: {
    badge: "bg-purple-100 text-purple-800 border border-purple-200",
    progress: "bg-purple-100",
    mapSolid: "bg-purple-500",
    mapSoft: "bg-purple-500/20 border-purple-500/40",
  },
};

const STATUS_LABEL: Record<IrrigationStatus, string> = {
  seco: "Seco",
  riego: "Momento de regar",
  ideal: "Humedad ideal",
  exceso: "Exceso de humedad",
};

const CROP_LABEL: Record<CropType, string> = {
  maiz: "Maíz",
  trigo: "Trigo",
  jitomate: "Jitomate",
  frijol: "Frijol",
};

const IrrigationPanel: React.FC<IrrigationPanelProps> = ({
  apiBaseUrl,
  zones,
  availableIds,
  onZoneSaved,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("create");
  const [, setEditingZone] = useState<DeviceWithLastReading | null>(
    null
  );

  const [form, setForm] = useState<ZoneFormState>({
    esp32Id: "",
    name: "",
    latitude: "",
    longitude: "",
    crop: "",
  });
  const [saving, setSaving] = useState(false);

  // Abrir en modo agregar
  const openCreate = () => {
    setSheetMode("create");
    setEditingZone(null);
    setForm({
      esp32Id: availableIds[0] ?? "",
      name: "",
      latitude: "",
      longitude: "",
      crop: "",
    });
    setSheetOpen(true);
  };

  // Abrir en modo editar
  const openEdit = (zone: DeviceWithLastReading) => {
    setSheetMode("edit");
    setEditingZone(zone);
    setForm({
      esp32Id: zone.id,
      name: zone.name,
      latitude: String(zone.latitude),
      longitude: String(zone.longitude),
      crop: zone.crop,
    });
    setSheetOpen(true);
  };

  // Si cambian availableIds y estamos en create sin ID, selecciona el primero
  useEffect(() => {
    if (sheetMode === "create" && !form.esp32Id && availableIds.length > 0) {
      setForm((prev) => ({ ...prev, esp32Id: availableIds[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds]);

  const handleFormChange = (
    field: keyof ZoneFormState,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.esp32Id || !form.name || !form.crop) return;

    const payload = {
      id: form.esp32Id,
      name: form.name,
      latitude: Number(form.latitude || 0),
      longitude: Number(form.longitude || 0),
      crop: form.crop as CropType,
    };

    setSaving(true);
    try {
      const url =
        sheetMode === "create"
          ? `${apiBaseUrl}/api/devices`
          : `${apiBaseUrl}/api/devices/${encodeURIComponent(form.esp32Id)}`;

      const method = sheetMode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("Error guardando zona:", await res.text());
      } else {
        onZoneSaved?.();
        setSheetOpen(false);
      }
    } catch (err) {
      console.error("Error guardando zona:", err);
    } finally {
      setSaving(false);
    }
  };

  const zonesWithStatus = useMemo(() => {
    return zones.map((z) => {
      if (!z.lastReading) {
        return { zone: z, status: null as IrrigationStatus | null };
      }
      const status = computeIrrigationStatus(
        z.crop,
        z.lastReading.moisture
      );
      return { zone: z, status };
    });
  }, [zones]);

  return (
    <div className="space-y-6">
      {/* Header + botón agregar */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Panel de riego</h2>
          <p className="text-sm text-muted-foreground">
            Indica si es óptimo regar en cada zona según el cultivo y la
            humedad actual.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </div>

      {/* Tabs CardView / MapView */}
      <Tabs defaultValue="cards" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="cards">CardView</TabsTrigger>
          <TabsTrigger value="map">MapView</TabsTrigger>
        </TabsList>

        <TabsContent value="cards">
          <CardView zonesWithStatus={zonesWithStatus} onEdit={openEdit} />
        </TabsContent>

        <TabsContent value="map">
          <MapView zonesWithStatus={zonesWithStatus} />
        </TabsContent>
      </Tabs>

      {/* FormView en Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="space-y-4">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "create"
                ? "Agregar ESP32 / zona"
                : "Editar ESP32 / zona"}
            </SheetTitle>
            <SheetDescription>
              Configura el nombre de la zona, su ubicación y el cultivo
              asociado a la ESP32.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ID de la ESP32 */}
            <div className="space-y-2">
              <Label>ESP32</Label>
              <Select
                value={form.esp32Id}
                onValueChange={(value) =>
                  handleFormChange("esp32Id", value)
                }
                disabled={sheetMode === "edit"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el ID de la ESP32" />
                </SelectTrigger>
                <SelectContent>
                  {availableIds.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No hay ESP32 detectadas aún
                    </SelectItem>
                  ) : (
                    availableIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Los IDs provienen de las lecturas enviadas por las ESP32.
              </p>
            </div>

            {/* Nombre de la zona */}
            <div className="space-y-2">
              <Label>Nombre de la zona</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  handleFormChange("name", e.target.value)
                }
                placeholder="Ejemplo: Zona norte, Invernadero 1..."
              />
            </div>

            {/* Ubicación */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitud</Label>
                <Input
                  value={form.latitude}
                  onChange={(e) =>
                    handleFormChange("latitude", e.target.value)
                  }
                  placeholder="19.4326"
                />
              </div>
              <div className="space-y-2">
                <Label>Longitud</Label>
                <Input
                  value={form.longitude}
                  onChange={(e) =>
                    handleFormChange("longitude", e.target.value)
                  }
                  placeholder="-99.1332"
                />
              </div>
            </div>

            {/* Cultivo */}
            <div className="space-y-2">
              <Label>Cultivo</Label>
              <Select
                value={form.crop || undefined}
                onValueChange={(value) =>
                  handleFormChange("crop", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona cultivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maiz">Maíz</SelectItem>
                  <SelectItem value="trigo">Trigo</SelectItem>
                  <SelectItem value="jitomate">Jitomate</SelectItem>
                  <SelectItem value="frijol">Frijol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SheetFooter className="flex items-center justify-end gap-2">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </SheetClose>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Guardando..."
                  : sheetMode === "create"
                  ? "Agregar"
                  : "Guardar cambios"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default IrrigationPanel;

// --- CardView ---

interface CardViewProps {
  zonesWithStatus: {
    zone: DeviceWithLastReading;
    status: IrrigationStatus | null;
  }[];
  onEdit: (zone: DeviceWithLastReading) => void;
}

const CardView: React.FC<CardViewProps> = ({
  zonesWithStatus,
  onEdit,
}) => {
  if (zonesWithStatus.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No hay zonas configuradas todavía. Agrega una con el botón
          &quot;Agregar&quot;.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {zonesWithStatus.map(({ zone, status }) => {
        const reading = zone.lastReading;
        const moisture = reading?.moisture ?? null;
        const temperature = reading?.temperature ?? null;

        let badgeLabel = "Sin datos";
        let badgeClasses =
          "bg-muted text-muted-foreground border border-border";
        let progressValue = 0;
        let progressClasses = "bg-muted";

        if (status && moisture != null) {
          badgeLabel = STATUS_LABEL[status];
          badgeClasses = STATUS_COLORS[status].badge;
          progressValue = computeIrrigationProgress(moisture);
          progressClasses = STATUS_COLORS[status].progress;
        }

        return (
          <Card key={zone.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {zone.name || "Zona sin nombre"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    ID ESP32: {zone.id}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(zone)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              {/* Humedad */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Droplet className="h-5 w-5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {moisture != null
                        ? `${moisture.toFixed(1)} %`
                        : "Sin datos"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Humedad del suelo
                    </span>
                  </div>
                </div>
                <Badge className={badgeClasses}>{badgeLabel}</Badge>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Leaf className="h-3 w-3" />
                  Indicador de riego
                </p>
                <Progress
                  value={progressValue}
                  className={`h-2 ${progressClasses}`}
                />
              </div>

              {/* Temperatura + cultivo */}
              <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {temperature != null
                        ? `${temperature.toFixed(1)} °C`
                        : "Sin datos"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Temperatura ambiente
                    </span>
                  </div>
                </div>

                <Badge variant="secondary" className="flex items-center gap-1">
                  <Leaf className="h-3 w-3" />
                  <span className="capitalize">
                    {CROP_LABEL[zone.crop]}
                  </span>
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// --- MapView ---

interface MapViewProps {
  zonesWithStatus: {
    zone: DeviceWithLastReading;
    status: IrrigationStatus | null;
  }[];
}

const MapView: React.FC<MapViewProps> = ({ zonesWithStatus }) => {
  if (zonesWithStatus.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No hay zonas configuradas para mostrar en el mapa.
        </CardContent>
      </Card>
    );
  }

  const latitudes = zonesWithStatus.map((z) => z.zone.latitude);
  const longitudes = zonesWithStatus.map((z) => z.zone.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  const project = (lat: number, lng: number) => {
    const x = ((lng - minLng) / lngRange) * 100;
    const y = (1 - (lat - minLat) / latRange) * 100;
    return { x, y };
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mapa de zonas</CardTitle>
        <CardDescription className="text-xs">
          Cada punto representa una ESP32, con un radio aproximado de 18 m.
          El color indica el estado de riego.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative w-full h-[420px] bg-muted rounded-lg overflow-hidden border border-border">
          {/* Puntos en el mapa */}
          {zonesWithStatus.map(({ zone, status }) => {
            const { x, y } = project(zone.latitude, zone.longitude);
            const s = status ?? "seco";
            const colors = STATUS_COLORS[s];

            return (
              <div
                key={zone.id}
                className="absolute"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                }}
              >
                <div className="relative -translate-x-1/2 -translate-y-1/2">
                  {/* Radio 18 m - representación visual */}
                  <div
                    className={`w-24 h-24 rounded-full ${colors.mapSoft} flex items-center justify-center`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full ${colors.mapSolid} shadow-md`}
                    />
                  </div>
                  <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-xs bg-background/90 border border-border rounded px-1.5 py-0.5">
                    {zone.name || zone.id}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
          <LegendItem color="bg-red-500" label="Seco" />
          <LegendItem color="bg-yellow-500" label="Riego (óptimo para regar)" />
          <LegendItem color="bg-blue-500" label="Rango ideal" />
          <LegendItem color="bg-purple-500" label="Exceso de humedad" />
        </div>
      </CardContent>
    </Card>
  );
};

interface LegendItemProps {
  color: string;
  label: string;
}

const LegendItem: React.FC<LegendItemProps> = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <span className={`w-3 h-3 rounded-full ${color}`} />
    <span>{label}</span>
  </div>
);
