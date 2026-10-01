import type { Device } from "../types/models";
import { StatusBadge } from "./StatusBadge";

interface DeviceListProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
}

export function DeviceList({ devices, selectedDeviceId, onSelect }: DeviceListProps) {
  if (devices.length === 0) {
    return <p className="empty-state">No hay dispositivos registrados todavía.</p>;
  }

  return (
    <ul className="device-list">
      {devices.map((device) => (
        <li key={device.id}>
          <button
            type="button"
            className={`device-list__item ${device.id === selectedDeviceId ? "device-list__item--active" : ""}`}
            onClick={() => onSelect(device.id)}
          >
            <span className="device-list__name">{device.name}</span>
            <span className="device-list__code">{device.deviceCode}</span>
            <StatusBadge status={device.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
