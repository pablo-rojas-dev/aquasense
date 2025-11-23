import { useBLE } from './hooks/useBLE';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Thermometer, Droplets, Bluetooth, BluetoothConnected } from "lucide-react";

export default function App() {
  const { connectToDevice, isConnected, dataHistory, error } = useBLE();

  // Obtenemos la lectura más reciente para el "Live Preview"
  const latest = dataHistory[0] || { temperature: 0, moisture: 0 };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header & Connection */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Monitor de Cultivo</h1>
            <p className="text-slate-500">ESP32 + AHT10 + Capacitive Soil Sensor</p>
          </div>
          <Button 
            onClick={connectToDevice} 
            variant={isConnected ? "outline" : "default"}
            className={isConnected ? "border-green-500 text-green-600" : "bg-blue-600"}
            disabled={isConnected}
          >
            {isConnected ? <><BluetoothConnected className="mr-2 h-4 w-4" /> Conectado</> : <><Bluetooth className="mr-2 h-4 w-4" /> Conectar BLE</>}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Live Data Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Temperatura Actual</CardTitle>
              <Thermometer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latest.temperature}°C</div>
              <p className="text-xs text-muted-foreground">Sensor AHT10</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Humedad Suelo</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latest.moisture}%</div>
              <p className="text-xs text-muted-foreground">Sensor Capacitivo v1.2</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Data Table */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Historial de Registros</CardTitle>
            <CardDescription>Datos recibidos en tiempo real vía Bluetooth.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="temp" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="temp">TemperatureView</TabsTrigger>
                <TabsTrigger value="moisture">MoistureView</TabsTrigger>
              </TabsList>

              {/* VISTA TEMPERATURA */}
              <TabsContent value="temp">
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Hora</TableHead>
                        <TableHead>Temperatura (°C)</TableHead>
                        <TableHead className="text-right">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataHistory.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.timestamp}</TableCell>
                          <TableCell>{d.temperature}°C</TableCell>
                          <TableCell className="text-right">
                            {d.temperature > 30 ? 
                              <span className="text-red-500 font-bold">Alta</span> : 
                              <span className="text-green-600">Normal</span>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                      {dataHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center">
                            Esperando datos...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* VISTA HUMEDAD */}
              <TabsContent value="moisture">
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Hora</TableHead>
                        <TableHead>Humedad (%)</TableHead>
                        <TableHead className="text-right">Riego</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataHistory.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.timestamp}</TableCell>
                          <TableCell>{d.moisture}%</TableCell>
                          <TableCell className="text-right">
                            {d.moisture < 30 ? 
                              <span className="text-amber-500 font-bold">Necesario</span> : 
                              <span className="text-blue-600">Óptimo</span>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                      {dataHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center">
                            Esperando datos...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}