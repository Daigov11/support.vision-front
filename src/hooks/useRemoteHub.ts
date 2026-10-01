import { useCallback, useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import type {
  DevicePresenceMessage,
  SessionRespondedMessage,
  SessionEndedMessage,
  AnswerMessage,
  IceCandidateMessage,
  TurnCredentialsDto,
} from "../types/signaling";
import type { DeviceDiagnosticEventDto, DeviceHealthSnapshotDto } from "../types/diagnostics";
import type { OutgoingIceCandidate } from "../webrtc/RemoteScreenPeer";
import { getAccessToken } from "../auth/authStore";

const HUB_URL = import.meta.env.VITE_HUB_URL ?? "http://localhost:5080/hubs/remote";

export type HubStatus = "connecting" | "connected" | "disconnected";

interface RemoteHubHandlers {
  onDevicePresenceChanged?: (message: DevicePresenceMessage) => void;
  onSessionResponded?: (message: SessionRespondedMessage) => void;
  onSessionEnded?: (message: SessionEndedMessage) => void;
  onReceiveAnswer?: (message: AnswerMessage) => void;
  onReceiveIceCandidate?: (message: IceCandidateMessage) => void;
  onDeviceDiagnosticsUpdated?: (snapshot: DeviceHealthSnapshotDto) => void;
  onDeviceDiagnosticEventReceived?: (event: DeviceDiagnosticEventDto) => void;
}

export interface RemoteHubApi {
  status: HubStatus;
  /**
   * Se une a la sala de señalización de una sesión ya aceptada (requerido por
   * RemoteHub.JoinSession antes de poder enviar/recibir offer/answer/ICE).
   */
  joinSession: (sessionId: string) => Promise<void>;
  /** Envía la oferta SDP del panel (ofertante) para una sesión ya unida. */
  sendOffer: (sessionId: string, sdp: string) => Promise<void>;
  /** Envía un candidato ICE local para una sesión ya unida. */
  sendIceCandidate: (sessionId: string, candidate: OutgoingIceCandidate) => Promise<void>;
  /**
   * Pide credenciales TURN efímeras (RemoteHub.GetTurnCredentials) para una sesión ya unida y
   * las mapea a `RTCIceServer[]`. Solo funciona con la sesión Accepted/Active; no hay endpoint
   * REST equivalente. El resultado no se registra en consola (son credenciales de corta
   * duración) y el llamador es responsable de no conservarlas más allá de la sesión.
   */
  getTurnCredentials: (sessionId: string) => Promise<RTCIceServer[]>;
}

function ensureConnected(connection: signalR.HubConnection | null): signalR.HubConnection {
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
    throw new Error("No hay conexión con el hub de señalización.");
  }
  return connection;
}

/**
 * Conecta al RemoteHub y se une al grupo "panel" para recibir presencia de
 * dispositivos y eventos de sesión en tiempo real. Si el hub no está disponible
 * (backend caído), el panel sigue siendo utilizable con datos mock/REST.
 */
export function useRemoteHub(handlers: RemoteHubHandlers): RemoteHubApi {
  const [status, setStatus] = useState<HubStatus>("connecting");
  const handlersRef = useRef(handlers);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      // Access token JWT real (ver src/auth/authStore.ts). Se llama de nuevo en cada intento de
      // reconexión automática, así que si el token cambió (refresh silencioso) mientras tanto,
      // la reconexión usa el nuevo. RemoteHub.JoinSession es el único método que exige esta
      // identidad (Android nunca manda token: se autentica por deviceCode+pairingKey aparte).
      .withUrl(HUB_URL, { accessTokenFactory: () => getAccessToken() ?? "" })
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    connection.on("DevicePresenceChanged", (message: DevicePresenceMessage) => {
      handlersRef.current.onDevicePresenceChanged?.(message);
    });
    connection.on("SessionResponded", (message: SessionRespondedMessage) => {
      handlersRef.current.onSessionResponded?.(message);
    });
    connection.on("SessionEnded", (message: SessionEndedMessage) => {
      handlersRef.current.onSessionEnded?.(message);
    });
    connection.on("ReceiveAnswer", (message: AnswerMessage) => {
      handlersRef.current.onReceiveAnswer?.(message);
    });
    connection.on("ReceiveIceCandidate", (message: IceCandidateMessage) => {
      handlersRef.current.onReceiveIceCandidate?.(message);
    });
    connection.on("DeviceDiagnosticsUpdated", (message: DeviceHealthSnapshotDto) => {
      handlersRef.current.onDeviceDiagnosticsUpdated?.(message);
    });
    connection.on("DeviceDiagnosticEventReceived", (message: DeviceDiagnosticEventDto) => {
      handlersRef.current.onDeviceDiagnosticEventReceived?.(message);
    });

    connection.onreconnecting(() => setStatus("connecting"));
    connection.onreconnected(() => setStatus("connected"));
    connection.onclose(() => setStatus("disconnected"));

    connection
      .start()
      .then(() => {
        setStatus("connected");
        return connection.invoke("JoinPanel");
      })
      .catch(() => setStatus("disconnected"));

    return () => {
      connectionRef.current = null;
      connection.stop();
    };
  }, []);

  const joinSession = useCallback(async (sessionId: string) => {
    await ensureConnected(connectionRef.current).invoke("JoinSession", sessionId);
  }, []);

  const sendOffer = useCallback(async (sessionId: string, sdp: string) => {
    await ensureConnected(connectionRef.current).invoke("SendOffer", { sessionId, sdp });
  }, []);

  const sendIceCandidate = useCallback(async (sessionId: string, candidate: OutgoingIceCandidate) => {
    await ensureConnected(connectionRef.current).invoke("SendIceCandidate", { sessionId, ...candidate });
  }, []);

  const getTurnCredentials = useCallback(async (sessionId: string): Promise<RTCIceServer[]> => {
    const result = await ensureConnected(connectionRef.current).invoke<TurnCredentialsDto>(
      "GetTurnCredentials",
      sessionId,
    );
    // No se registra `result` en consola: username/credential son credenciales TURN.
    return result.iceServers.map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    }));
  }, []);

  return { status, joinSession, sendOffer, sendIceCandidate, getTurnCredentials };
}
