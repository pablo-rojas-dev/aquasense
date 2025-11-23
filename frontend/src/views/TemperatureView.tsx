import type { SensorReading } from "../types";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from "@/components/ui/table";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

interface Props {
  readings: SensorReading[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

const TemperatureView: React.FC<Props> = ({ readings }) => {
  const chartData = readings.map((r) => ({
    time: formatTime(r.receivedAt),
    temperature: r.temperature
  }));

  return (
    <div className="space-y-6">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis unit="°C" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="temperature"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora (PC)</TableHead>
              <TableHead>Temperatura (°C)</TableHead>
              <TableHead>Timestamp ESP32 (ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {readings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Sin lecturas aún.
                </TableCell>
              </TableRow>
            ) : (
              readings
                .slice()
                .reverse()
                .map((r, idx) => (
                  <TableRow key={`${r.timestamp}-${idx}`}>
                    <TableCell>{formatTime(r.receivedAt)}</TableCell>
                    <TableCell>{r.temperature.toFixed(2)}</TableCell>
                    <TableCell>{r.timestamp}</TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TemperatureView;
