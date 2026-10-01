import type { DeviceStatus } from "../types/models";

const LABELS: Record<DeviceStatus, string> = {
  Online: "En línea",
  Offline: "Desconectado",
  InSession: "En sesión",
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return <span className={`status-badge status-badge--${status.toLowerCase()}`}>{LABELS[status]}</span>;
}
