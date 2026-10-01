import type { HubStatus } from "../hooks/useRemoteHub";

interface ConnectionBannerProps {
  hubStatus: HubStatus;
  usingMockData: boolean;
}

export function ConnectionBanner({ hubStatus, usingMockData }: ConnectionBannerProps) {
  if (!usingMockData && hubStatus === "connected") {
    return null;
  }

  return (
    <div className="connection-banner">
      {usingMockData && <span>⚠ Backend no disponible: mostrando dispositivos de ejemplo.</span>}
      {hubStatus !== "connected" && (
        <span>
          {" "}
          Señalización en tiempo real: {hubStatus === "connecting" ? "conectando…" : "desconectada"}.
        </span>
      )}
    </div>
  );
}
