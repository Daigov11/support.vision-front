export type DiagnosticEventType =
  | "NetworkChanged"
  | "BatteryCritical"
  | "AgentError"
  | "ApplicationInfo"
  | "ApplicationWarning"
  | "ApplicationError"
  | "ApplicationException";

export interface DeviceHealthSnapshotDto {
  deviceId: string;
  batteryPercent: number | null;
  isCharging: boolean | null;
  networkConnected: boolean;
  networkType: string | null;
  wifiSignalLevel: number | null;
  storageTotalBytes: number | null;
  storageUsedBytes: number | null;
  storageAvailableBytes: number | null;
  manufacturer: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  receivedAt: string;
}

export interface DeviceDiagnosticEventDto {
  id: string;
  deviceId: string;
  type: DiagnosticEventType;
  message: string | null;
  /** Código corto opcional definido por la app fuente (solo eventos "Application*"). */
  code: string | null;
  /** Package name verificado por Android del lado de Vision Support; null = evento propio del agente. */
  sourcePackage: string | null;
  /** Versión de la app fuente (la suya, no la de Vision Support); null para eventos propios del agente. */
  sourceAppVersion: string | null;
  /** Instante reportado por el reloj del dispositivo fuente; puede preceder a createdAt si venía en cola offline. */
  occurredAt: string | null;
  createdAt: string;
}
