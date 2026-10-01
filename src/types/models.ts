export type DeviceStatus = "Offline" | "Online" | "InSession";

export interface Device {
  id: string;
  deviceCode: string;
  name: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export type SessionStatus = "Requested" | "Accepted" | "Rejected" | "Active" | "Ended";

export interface RemoteSession {
  id: string;
  deviceId: string;
  deviceName: string;
  technicianUserId: string;
  technicianName: string;
  status: SessionStatus;
  requestedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
}
