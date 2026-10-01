import { apiClient } from "./client";
import type { CreatePairingCodeResponse, PairingCodeDto } from "../types/pairing";

export function fetchPairingCodes(): Promise<PairingCodeDto[]> {
  return apiClient.get<PairingCodeDto[]>("/api/pairing-codes");
}

export function createPairingCode(label?: string): Promise<CreatePairingCodeResponse> {
  return apiClient.post<CreatePairingCodeResponse>("/api/pairing-codes", { label: label || null });
}

export function revokePairingCode(id: string): Promise<PairingCodeDto> {
  return apiClient.post<PairingCodeDto>(`/api/pairing-codes/${id}/revoke`);
}
