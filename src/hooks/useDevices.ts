import { useCallback, useEffect, useState } from "react";
import { fetchDevices } from "../api/devices";
import { mockDevices } from "../mock/devices";
import type { Device, DeviceStatus } from "../types/models";

interface UseDevicesResult {
  devices: Device[];
  loading: boolean;
  usingMockData: boolean;
  error: string | null;
  refresh: () => void;
  setDeviceStatus: (deviceId: string, status: DeviceStatus, lastSeenAt: string) => void;
}

export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchDevices()
      .then((result) => {
        if (cancelled) return;
        setDevices(result);
        setUsingMockData(false);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDevices(mockDevices);
        setUsingMockData(true);
        setError(err instanceof Error ? err.message : "No se pudo conectar con el backend");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const setDeviceStatus = useCallback((deviceId: string, status: DeviceStatus, lastSeenAt: string) => {
    setDevices((current) =>
      current.map((device) => (device.id === deviceId ? { ...device, status, lastSeenAt } : device)),
    );
  }, []);

  return { devices, loading, usingMockData, error, refresh, setDeviceStatus };
}
