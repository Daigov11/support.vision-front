import { apiClient } from "./client";
import type { DeviceDiagnosticEventDto, DeviceHealthSnapshotDto } from "../types/diagnostics";

/** undefined si el dispositivo existe pero todavía no reportó ningún diagnóstico (204). */
export function fetchDeviceDiagnostics(deviceId: string): Promise<DeviceHealthSnapshotDto | undefined> {
  return apiClient.get<DeviceHealthSnapshotDto | undefined>(`/api/devices/${deviceId}/diagnostics`);
}

export function fetchDeviceDiagnosticEvents(deviceId: string): Promise<DeviceDiagnosticEventDto[]> {
  return apiClient.get<DeviceDiagnosticEventDto[]>(`/api/devices/${deviceId}/diagnostics/events`);
}
