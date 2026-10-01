import type { Device } from "../types/models";

// Datos de ejemplo usados solo cuando el backend no responde, para poder
// desarrollar y demostrar el panel sin depender de la API.
export const mockDevices: Device[] = [
  {
    id: "mock-1",
    deviceCode: "DEV-0001",
    name: "Recepción - Caja 1",
    status: "Online",
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    deviceCode: "DEV-0002",
    name: "Almacén - Tablet 3",
    status: "Offline",
    lastSeenAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "mock-3",
    deviceCode: "DEV-0003",
    name: "Oficina - Terminal 2",
    status: "InSession",
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];
