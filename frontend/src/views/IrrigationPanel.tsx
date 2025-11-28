import React, { useEffect, useMemo, useState, useRef } from "react";
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
  availableIds: string[]; // ya no se usa para el Select, pero se mantiene por compatibilidad
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
    progress: "bg-red-100 [&>div]:bg-red-800",
    mapSolid: "bg-red-600",
    mapSoft: "bg-red-600/20 border-red-600/40",
  },
  riego: {
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    progress: "bg-yellow-100 [&>div]:bg-yellow-800",
    mapSolid: "bg-yellow-600",
    mapSoft: "bg-yellow-600/20 border-yellow-600/40",
  },
  ideal: {
    badge: "bg-blue-100 text-blue-800 border border-blue-200",
    progress: "bg-blue-100 [&>div]:bg-blue-800",
    mapSolid: "bg-blue-600",
    mapSoft: "bg-blue-600/20 border-blue-600/40",
  },
  exceso: {
    badge: "bg-purple-100 text-purple-800 border border-purple-200",
    progress: "bg-purple-100 [&>div]:bg-purple-800",
    mapSolid: "bg-purple-600",
    mapSoft: "bg-purple-600/20 border-purple-600/40",
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

const GOOGLE_STATIC_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_STATIC_MAPS_API_KEY || "";

const IrrigationPanel: React.FC<IrrigationPanelProps> = ({
  apiBaseUrl,
  zones,
  onZoneSaved,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("create");
  const [, setEditingZone] = useState<DeviceWithLastReading | null>(null);

  const [form, setForm] = useState<ZoneFormState>({
    esp32Id: "",
    name: "",
    latitude: "",
    longitude: "",
    crop: "",
  });
  const [saving, setSaving] = useState(false);

  // IDs devueltos por el backend desde /api/device-ids
  const [deviceIds, setDeviceIds] = useState<string[]>([]);

  // Cuando se abre el sheet (create o edit), consultamos /api/device-ids
  useEffect(() => {
    if (!sheetOpen) return;

    const fetchIds = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/device-ids`);
        if (!res.ok) {
          console.error("Error obteniendo device-ids:", await res.text());
          return;
        }
        const ids = await res.json();
        if (Array.isArray(ids)) {
          setDeviceIds(
            Array.from(
              new Set(
                ids.filter((id: unknown): id is string => typeof id === "string")
              )
            )
          );
        }
      } catch (err) {
        console.error("Error obteniendo device-ids:", err);
      }
    };

    fetchIds();
  }, [sheetOpen, apiBaseUrl]);

  // IDs que ya tienen zona configurada
  const configuredIds = useMemo(
    () =>
      new Set(
        zones
          .filter((z) => z.name && z.crop)
          .map((z) => z.id)
      ),
    [zones]
  );

  // IDs disponibles para seleccionar en modo "create":
  // todos los deviceIds menos los que ya están en zones
  const selectableIds = useMemo(
    () => deviceIds.filter((id) => !configuredIds.has(id)),
    [deviceIds, configuredIds]
  );

  // Abrir en modo agregar
  const openCreate = () => {
    setSheetMode("create");
    setEditingZone(null);
    setForm({
      esp32Id: "",
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

  // En modo create, cuando haya IDs seleccionables y aún no se haya elegido uno,
  // asignamos automáticamente el primero.
  useEffect(() => {
    if (
      sheetMode === "create" &&
      !form.esp32Id &&
      selectableIds.length > 0
    ) {
      setForm((prev) => ({ ...prev, esp32Id: selectableIds[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMode, selectableIds]);

  const handleFormChange = (field: keyof ZoneFormState, value: string) => {
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
      const status = computeIrrigationStatus(z.crop, z.lastReading.moisture);
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
          <TabsTrigger value="cards">Lista</TabsTrigger>
          <TabsTrigger value="map">Mapa</TabsTrigger>
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
        <SheetContent className="space-y-4 p-4">
          <SheetHeader>
            <SheetTitle className="bg-primary text-white text-2xl text-center mt-5 mb-2 py-2 rounded-md inline-block">
              {sheetMode === "create"
                ? "Agregar zona (Estaca)"
                : "Editar zona (Estaca)"}
            </SheetTitle>
            <SheetDescription>
              Configura el nombre de la zona, su ubicación y el cultivo asociado
              a la estaca.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ID de la ESP32 (Estaca) */}
            <div className="space-y-2">
              <Label>Estaca</Label>
              <Select
                value={form.esp32Id}
                onValueChange={(value) =>
                  handleFormChange("esp32Id", value)
                }
                disabled={sheetMode === "edit"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la estaca" />
                </SelectTrigger>
                <SelectContent>
                  {sheetMode === "edit" ? (
                    <SelectItem value={form.esp32Id}>
                      {form.esp32Id}
                    </SelectItem>
                  ) : selectableIds.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No hay estacas disponibles para agregar
                    </SelectItem>
                  ) : (
                    selectableIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
                  <CardTitle className="bg-primary text-lg text-white px-4 py-1 mb-1 rounded-md inline-block">
                    {zone.name || "Zona sin nombre"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {zone.id}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => onEdit(zone)}
                >
                  <Settings className="h-6! w-6!" />
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

// Constantes para proyección Web Mercator
const TILE_SIZE = 256;
const EARTH_RADIUS = 6378137; // metros
const MAX_STATIC_MAP_SIZE = 640; // límite típico de Google Static Maps (sin scale=2)

function latLngToWorld(lat: number, lng: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * TILE_SIZE;
  const y =
    (0.5 -
      Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
    TILE_SIZE;
  return { x, y };
}

function worldToLatLng(x: number, y: number) {
  const lng = (x / TILE_SIZE) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / TILE_SIZE;
  const lat =
    (180 / Math.PI) *
    Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

const MapView: React.FC<MapViewProps> = ({ zonesWithStatus }) => {
  const [hasInternet, setHasInternet] = useState(true);

  // Centro inicial del mapa
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => {
    if (zonesWithStatus.length === 0) {
      return { lat: 0, lng: 0 };
    }
    const latitudes = zonesWithStatus.map((z) => z.zone.latitude);
    const longitudes = zonesWithStatus.map((z) => z.zone.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    return { lat: centerLat, lng: centerLng };
  });

  const [zoom, setZoom] = useState<number>(() => {
    if (zonesWithStatus.length === 0) return 13;

    const latitudes = zonesWithStatus.map((z) => z.zone.latitude);
    const longitudes = zonesWithStatus.map((z) => z.zone.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;
    const maxRange = Math.max(latRange, lngRange);

    let initialZoom = 16;
    if (maxRange > 1) initialZoom = 10;
    else if (maxRange > 0.1) initialZoom = 13;

    return initialZoom;
  });

  // Panning
  const [isPanning, setIsPanning] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(
    null
  );

  // Tamaño del contenedor para convertir píxeles a posiciones
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({
    width: 1,
    height: 1,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateStatus = () => setHasInternet(navigator.onLine);
    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 1, 20));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 1, 1));
  };

  // Tamaño "teórico" del mapa que pedimos a Static Maps
  const rawWidth = Math.max(1, Math.round(containerSize.width));
  const rawHeight = Math.max(1, Math.round(containerSize.height));
  const downscaleFactor = Math.min(
    MAX_STATIC_MAP_SIZE / rawWidth,
    MAX_STATIC_MAP_SIZE / rawHeight,
    1
  );
  const imageWidth = Math.max(1, Math.round(rawWidth * downscaleFactor));
  const imageHeight = Math.max(1, Math.round(rawHeight * downscaleFactor));

  const mapUrl = useMemo(() => {
    if (!hasInternet || zonesWithStatus.length === 0) return null;

    const size = `${imageWidth}x${imageHeight}`;

    const keyParam = GOOGLE_STATIC_MAPS_API_KEY
      ? `&key=${GOOGLE_STATIC_MAPS_API_KEY}`
      : "";

    const styleParams =
      "&maptype=roadmap" +
      "&style=feature:all|element:labels|visibility:off" +
      "&style=feature:poi|visibility:off";

    return `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${size}${styleParams}${keyParam}`;
  }, [hasInternet, zonesWithStatus, center, zoom, imageWidth, imageHeight]);

  if (zonesWithStatus.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No hay zonas configuradas para mostrar en el mapa.
        </CardContent>
      </Card>
    );
  }

  // --- Cálculo del radio equivalente a 18 m en píxeles para el zoom actual ---
  const RADIUS_METERS = 18;
  const latRad = (center.lat * Math.PI) / 180;
  const scale = Math.pow(2, zoom);

  // metros por pixel en la latitud del centro (misma fórmula que Google)
  const metersPerPixel =
    (Math.cos(latRad) * 2 * Math.PI * EARTH_RADIUS) /
    (TILE_SIZE * scale);

  const radiusPx = RADIUS_METERS / metersPerPixel;
  const minRadiusPx = 6;
  const visualRadiusPx = Math.max(radiusPx, minRadiusPx);

  // Centro en coordenadas de mundo (Web Mercator) escaladas por el zoom
  const centerWorld = latLngToWorld(center.lat, center.lng);
  const centerWorldScaled = {
    x: centerWorld.x * scale,
    y: centerWorld.y * scale,
  };

  // --- Ajuste de cómo se dibuja la imagen dentro del contenedor (sin deformar) ---
  const containerW = containerSize.width;
  const containerH = containerSize.height;
  const imageRatio = imageWidth / imageHeight;
  const containerRatio = containerW / containerH;

  let renderedWidth = containerW;
  let renderedHeight = containerH;
  let offsetX = 0;
  let offsetY = 0;

  if (containerRatio > imageRatio) {
    // El contenedor es más "apaisado": la imagen ocupa toda la altura
    renderedHeight = containerH;
    renderedWidth = renderedHeight * imageRatio;
    offsetX = (containerW - renderedWidth) / 2;
    offsetY = 0;
  } else {
    // El contenedor es más "alto": la imagen ocupa todo el ancho
    renderedWidth = containerW;
    renderedHeight = renderedWidth / imageRatio;
    offsetX = 0;
    offsetY = (containerH - renderedHeight) / 2;
  }

  // Factor de escala de píxel de mapa -> píxel en pantalla
  const mapToScreenScale = renderedWidth / imageWidth;

  // Centro de la imagen dentro del contenedor
  const centerScreenX = offsetX + renderedWidth / 2;
  const centerScreenY = offsetY + renderedHeight / 2;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mapa de zonas</CardTitle>
        <CardDescription className="text-xs">
          Arrastra el mapa para navegar y usa el zoom para acercar/alejar.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div
          ref={mapRef}
          className="relative w-full h-[420px] bg-muted rounded-lg overflow-hidden border border-border cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            setIsPanning(true);
            setLastPoint({ x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(e) => {
            if (!isPanning || !lastPoint) return;
            const dx = e.clientX - lastPoint.x;
            const dy = e.clientY - lastPoint.y;

            setLastPoint({ x: e.clientX, y: e.clientY });

            // Convertir desplazamiento en píxeles a desplazamiento del centro
            setCenter((prev) => {
              const world = latLngToWorld(prev.lat, prev.lng);
              const worldScaled = {
                x: world.x * scale,
                y: world.y * scale,
              };

              const newWorldScaled = {
                x: worldScaled.x - dx / mapToScreenScale,
                y: worldScaled.y - dy / mapToScreenScale,
              };

              const newWorld = {
                x: newWorldScaled.x / scale,
                y: newWorldScaled.y / scale,
              };

              return worldToLatLng(newWorld.x, newWorld.y);
            });
          }}
          onMouseUp={() => {
            setIsPanning(false);
            setLastPoint(null);
          }}
          onMouseLeave={() => {
            setIsPanning(false);
            setLastPoint(null);
          }}
          onWheel={(e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
              handleZoomIn();
            } else if (e.deltaY > 0) {
              handleZoomOut();
            }
          }}
        >
          {/* Controles de zoom */}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-2">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={handleZoomIn}
            >
              +
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={handleZoomOut}
            >
              −
            </Button>
          </div>

          <div
            className="absolute inset-0"
            style={{
              backgroundImage: mapUrl ? `url(${mapUrl})` : undefined,
              // IMPORTANTE: no deformar la imagen
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          >
            {zonesWithStatus.map(({ zone, status }) => {
              const zoneWorld = latLngToWorld(
                zone.latitude,
                zone.longitude
              );
              const zoneWorldScaled = {
                x: zoneWorld.x * scale,
                y: zoneWorld.y * scale,
              };

              const dx = zoneWorldScaled.x - centerWorldScaled.x;
              const dy = zoneWorldScaled.y - centerWorldScaled.y;

              const left = centerScreenX + dx * mapToScreenScale;
              const top = centerScreenY + dy * mapToScreenScale;

              const s: IrrigationStatus = status ?? "seco";
              const colors = STATUS_COLORS[s];

              const circleDiameter = visualRadiusPx * 2 * mapToScreenScale;

              return (
                <div
                  key={zone.id}
                  className="absolute"
                  style={{
                    left,
                    top,
                  }}
                >
                  <div className="relative -translate-x-1/2 -translate-y-1/2">
                    {/* Radio físico de ~18 m (escala con el zoom y coincide con el mapa) */}
                    <div
                      className={`rounded-full ${colors.mapSoft} flex items-center justify-center`}
                      style={{
                        width: circleDiameter,
                        height: circleDiameter,
                      }}
                    >
                      <div
                        className={`rounded-full ${colors.mapSolid} shadow-md`}
                        style={{ width: 6, height: 6 }}
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
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
          <LegendItem color="bg-red-500" label="Seco" />
          <LegendItem
            color="bg-yellow-500"
            label="Riego (óptimo para regar)"
          />
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
