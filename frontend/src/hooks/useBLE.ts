import { useState } from 'react';

// UUIDs deben coincidir con el ESP32
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export interface SensorData {
  id: number;
  timestamp: string;
  temperature: number;
  moisture: number;
}

export const useBLE = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [dataHistory, setDataHistory] = useState<SensorData[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connectToDevice = async () => {
    try {
      setError(null);
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: "ESP32_Sensors" }],
        optionalServices: [SERVICE_UUID],
      });

      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService(SERVICE_UUID);
      const characteristic = await service?.getCharacteristic(CHARACTERISTIC_UUID_TX);

      await characteristic?.startNotifications();
      
      characteristic?.addEventListener('characteristicvaluechanged', handleCharacteristicChange);
      
      device.addEventListener('gattserverdisconnected', () => setIsConnected(false));
      
      setIsConnected(true);
    } catch (err) {
      console.error(err);
      setError("Error al conectar o dispositivo no compatible.");
    }
  };

  const handleCharacteristicChange = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(value);

    try {
      // Parsear JSON recibido del ESP32 {"t": 24.5, "m": 60}
      const parsed = JSON.parse(jsonString);
      
      const newData: SensorData = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        temperature: parsed.t,
        moisture: parsed.m
      };

      setDataHistory(prev => [newData, ...prev].slice(0, 50)); // Mantener últimos 50 registros
    } catch (e) {
      console.error("Error parseando JSON", e);
    }
  };

  return { connectToDevice, isConnected, dataHistory, error };
};