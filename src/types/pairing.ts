export type PairingCodeStatus = "Active" | "Expired" | "Used" | "Revoked";

export interface PairingCodeDto {
  id: string;
  status: PairingCodeStatus;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  deviceId: string | null;
  deviceName: string | null;
  createdByDisplayName: string;
}

export interface CreatePairingCodeResponse {
  id: string;
  code: string;
  expiresAt: string;
  label: string | null;
}
