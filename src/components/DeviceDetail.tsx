import { useState } from "react";
import type { Device, RemoteSession } from "../types/models";
import type { RemoteScreenPeerState } from "../webrtc/RemoteScreenPeer";
import type { DeviceDiagnosticEventDto, DeviceHealthSnapshotDto } from "../types/diagnostics";
import { StatusBadge } from "./StatusBadge";
import { RemoteVideo } from "./RemoteVideo";
import { DeviceDiagnostics } from "./DeviceDiagnostics";

type DetailTab = "support" | "diagnostics";

interface DeviceDetailProps {
  device: Device | null;
  session: RemoteSession | null;
  requesting: boolean;
  error: string | null;
  onRequestSession: () => void;
  onEndSession: () => void;
  remoteStream: MediaStream | null;
  peerState: RemoteScreenPeerState | null;
  peerError: string | null;
  diagnosticsLoading: boolean;
  diagnosticsError: string | null;
  diagnosticsSnapshot: DeviceHealthSnapshotDto | null;
  diagnosticEvents: DeviceDiagnosticEventDto[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function videoStatusLabel(session: RemoteSession | null, peerState: RemoteScreenPeerState | null, peerError: string | null): string {
  if (!session) {
    return "Sin sesión activa";
  }

  switch (session.status) {
    case "Requested":
      return "Esperando a que el dispositivo acepte…";
    case "Rejected":
      return "El dispositivo rechazó la sesión";
    case "Ended":
      return "Sesión finalizada";
    case "Accepted":
    case "Active":
      if (peerError) {
        return `Error de vídeo: ${peerError}`;
      }
      switch (peerState) {
        case "negotiating":
          return "Negociando conexión WebRTC…";
        case "connected":
          return "Conectado, esperando vídeo…";
        case "video-active":
          return "Vídeo activo";
        case "disconnected":
          return "Conexión de vídeo perdida";
        case "error":
          return "Error en la conexión WebRTC";
        default:
          return "Preparando conexión de vídeo…";
      }
    default:
      return "";
  }
}

export function DeviceDetail({
  device,
  session,
  requesting,
  error,
  onRequestSession,
  onEndSession,
  remoteStream,
  peerState,
  peerError,
  diagnosticsLoading,
  diagnosticsError,
  diagnosticsSnapshot,
  diagnosticEvents,
}: DeviceDetailProps) {
  const [tab, setTab] = useState<DetailTab>("support");

  if (!device) {
    return (
      <div className="device-detail device-detail--empty">
        <p>Selecciona un dispositivo de la lista para ver el detalle.</p>
      </div>
    );
  }

  const sessionIsOpen = session !== null && ["Requested", "Accepted", "Active"].includes(session.status);
  const canRequestSession = device.status === "Online" && !sessionIsOpen;

  return (
    <div className="device-detail">
      <header className="device-detail__header">
        <div>
          <h2>{device.name}</h2>
          <p className="device-detail__code">{device.deviceCode}</p>
        </div>
        <StatusBadge status={device.status} />
      </header>

      <dl className="device-detail__meta">
        <div>
          <dt>Última conexión</dt>
          <dd>{formatDate(device.lastSeenAt)}</dd>
        </div>
        <div>
          <dt>Registrado</dt>
          <dd>{formatDate(device.createdAt)}</dd>
        </div>
      </dl>

      <nav className="device-detail__tabs">
        <button
          type="button"
          className={tab === "support" ? "device-detail__tab device-detail__tab--active" : "device-detail__tab"}
          onClick={() => setTab("support")}
        >
          Soporte
        </button>
        <button
          type="button"
          className={tab === "diagnostics" ? "device-detail__tab device-detail__tab--active" : "device-detail__tab"}
          onClick={() => setTab("diagnostics")}
        >
          Diagnóstico
        </button>
      </nav>

      {tab === "support" ? (
        <>
          <section className="device-detail__session">
            <h3>Sesión de soporte</h3>

            {session ? (
              <ul className="session-info">
                <li>
                  Estado: <strong>{session.status}</strong>
                </li>
                <li>Solicitada: {formatDate(session.requestedAt)}</li>
                {session.startedAt && <li>Iniciada: {formatDate(session.startedAt)}</li>}
                {session.endedAt && <li>Finalizada: {formatDate(session.endedAt)}</li>}
              </ul>
            ) : (
              <p className="empty-state">No hay ninguna sesión con este dispositivo.</p>
            )}

            {error && <p className="error-text">{error}</p>}

            <div className="device-detail__actions">
              <button type="button" disabled={!canRequestSession || requesting} onClick={onRequestSession}>
                {requesting ? "Solicitando…" : "Solicitar sesión"}
              </button>
              {sessionIsOpen && (
                <button type="button" className="secondary" onClick={onEndSession}>
                  Finalizar sesión
                </button>
              )}
            </div>
          </section>

          <section className="device-detail__video">
            <h3>Pantalla remota</h3>
            <p className="video-status">{videoStatusLabel(session, peerState, peerError)}</p>
            <RemoteVideo stream={remoteStream} placeholderText="Esperando vídeo…" />
          </section>
        </>
      ) : (
        <section className="device-detail__diagnostics">
          <DeviceDiagnostics
            device={device}
            loading={diagnosticsLoading}
            error={diagnosticsError}
            snapshot={diagnosticsSnapshot}
            events={diagnosticEvents}
          />
        </section>
      )}
    </div>
  );
}
