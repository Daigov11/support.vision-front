import { apiClient } from "./client";
import type { RemoteSession } from "../types/models";

export function requestSession(deviceId: string): Promise<RemoteSession> {
  return apiClient.post<RemoteSession>("/api/sessions/request", { deviceId });
}

export function endSession(sessionId: string, reason?: string): Promise<RemoteSession> {
  return apiClient.post<RemoteSession>(`/api/sessions/${sessionId}/end`, { reason });
}
