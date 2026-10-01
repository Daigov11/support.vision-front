import { apiClient } from "./client";
import type { Device } from "../types/models";

export function fetchDevices(): Promise<Device[]> {
  return apiClient.get<Device[]>("/api/devices");
}
