import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { useAuth } from "./auth/useAuth";
import { logout, tryRestoreSession } from "./auth/authStore";
import { useDevices } from "./hooks/useDevices";
import { useRemoteHub } from "./hooks/useRemoteHub";
import { useRemoteScreenPeer } from "./hooks/useRemoteScreenPeer";
import { requestSession, endSession } from "./api/sessions";
import { fetchDeviceDiagnostics, fetchDeviceDiagnosticEvents } from "./api/diagnostics";
import { DeviceList } from "./components/DeviceList";
import { DeviceDetail } from "./components/DeviceDetail";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { LoginScreen } from "./components/LoginScreen";
import { UsersAdmin } from "./components/UsersAdmin";
import { PairDeviceAdmin } from "./components/PairDeviceAdmin";
import type { DeviceStatus, RemoteSession } from "./types/models";
import type { DeviceDiagnosticEventDto, DeviceHealthSnapshotDto } from "./types/diagnostics";

/** Cuántos eventos recientes se conservan en memoria por dispositivo (la API ya los pagina/poda en el backend). */
const MAX_EVENTS_IN_MEMORY = 50;

type View = "devices" | "users" | "pairing";

function DevicesPanel() {
  const { devices, usingMockData, setDeviceStatus, refresh } = useDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [sessionsByDevice, setSessionsByDevice] = useState<Record<string, RemoteSession>>({});
  const [requesting, setRequesting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Id de la sesión para la que ya completamos JoinSession con éxito (requisito del backend
  // antes de poder ofertar WebRTC). Null si aún no se unió, o si dejó de ser válida.
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  // Credenciales TURN efímeras para joinedSessionId, obtenidas después de JoinSession y antes
  // de crear el RemoteScreenPeer (ver el handler de onSessionResponded). Solo viven en memoria
  // mientras dura la sesión: se limpian en cuanto esta termina, cambia, o se pierde el hub.
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);

  const [diagnosticsByDevice, setDiagnosticsByDevice] = useState<Record<string, DeviceHealthSnapshotDto>>({});
  const [diagnosticEventsByDevice, setDiagnosticEventsByDevice] = useState<Record<string, DeviceDiagnosticEventDto[]>>({});
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const {
    status: hubStatus,
    joinSession,
    sendOffer,
    sendIceCandidate,
    getTurnCredentials,
  } = useRemoteHub({
    onDevicePresenceChanged: (message) => {
      setDeviceStatus(message.deviceId, message.status as DeviceStatus, message.timestamp);
    },
    onDeviceDiagnosticsUpdated: (snapshot) => {
      setDiagnosticsByDevice((current) => ({ ...current, [snapshot.deviceId]: snapshot }));
    },
    onDeviceDiagnosticEventReceived: (event) => {
      setDiagnosticEventsByDevice((current) => {
        const existing = current[event.deviceId] ?? [];
        return { ...current, [event.deviceId]: [event, ...existing].slice(0, MAX_EVENTS_IN_MEMORY) };
      });
    },
    onSessionResponded: (message) => {
      setSessionsByDevice((current) => {
        const existing = current[message.deviceId];
        if (!existing || existing.id !== message.sessionId) return current;
        return {
          ...current,
          [message.deviceId]: { ...existing, status: message.accepted ? "Accepted" : "Rejected" },
        };
      });

      if (message.accepted) {
        // Orden requerido: JoinSession primero (autoriza la sala de señalización), luego
        // GetTurnCredentials, y solo si ambos tienen éxito se marca la sesión como "unida" —
        // eso es lo que dispara la creación del RemoteScreenPeer (ver App() más abajo), así
        // que iceServers ya está listo antes de que exista el RTCPeerConnection. Si cualquiera
        // de los dos falla, no se crea ningún peer y no queda nada que liberar.
        joinSession(message.sessionId)
          .then(() => getTurnCredentials(message.sessionId))
          .then((servers) => {
            setIceServers(servers);
            setJoinedSessionId(message.sessionId);
          })
          .catch(() => {
            setIceServers([]);
            setSessionError("No se pudo preparar la conexión WebRTC (sala de señalización o credenciales TURN).");
          });
      }
    },
    onSessionEnded: (message) => {
      setSessionsByDevice((current) => {
        const next = { ...current };
        for (const deviceId of Object.keys(next)) {
          if (next[deviceId].id === message.sessionId) {
            next[deviceId] = { ...next[deviceId], status: "Ended", endReason: message.reason };
          }
        }
        return next;
      });
      setJoinedSessionId((current) => (current === message.sessionId ? null : current));
      setIceServers([]);
    },
    onReceiveAnswer: (message) => screenPeer.handleRemoteAnswer(message),
    onReceiveIceCandidate: (message) => screenPeer.handleRemoteIceCandidate(message),
  });

  // Si se pierde la conexión con el hub, la sesión de señalización unida deja de ser válida:
  // habrá que volver a solicitar/aceptar para poder re-unirse (JoinSession) tras reconectar.
  useEffect(() => {
    if (hubStatus !== "connected") {
      setJoinedSessionId(null);
      setIceServers([]);
    }
  }, [hubStatus]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const selectedSession = selectedDeviceId ? sessionsByDevice[selectedDeviceId] ?? null : null;

  // Carga el diagnóstico (REST) al seleccionar un dispositivo: el hub solo empuja eventos
  // NUEVOS (onDeviceDiagnosticsUpdated/onDeviceDiagnosticEventReceived), no hace backfill del
  // estado/histórico ya existente. Si el hub entrega algo más reciente mientras esta petición
  // está en vuelo, esa actualización igualmente queda reflejada (misma clave por deviceId).
  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    Promise.all([fetchDeviceDiagnostics(selectedDeviceId), fetchDeviceDiagnosticEvents(selectedDeviceId)])
      .then(([snapshot, events]) => {
        if (cancelled) return;
        if (snapshot) {
          setDiagnosticsByDevice((current) => ({ ...current, [selectedDeviceId]: snapshot }));
        }
        setDiagnosticEventsByDevice((current) => ({ ...current, [selectedDeviceId]: events }));
      })
      .catch((err) => {
        if (!cancelled) {
          setDiagnosticsError(err instanceof Error ? err.message : "No se pudo cargar el diagnóstico.");
        }
      })
      .finally(() => {
        if (!cancelled) setDiagnosticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  // Solo negociamos WebRTC para la sesión del dispositivo actualmente seleccionado, ya unida
  // (JoinSession) y todavía Accepted/Active. Cualquier cambio aquí (cambiar de dispositivo,
  // finalizar/rechazar sesión, perder el hub) cierra el peer anterior (ver useRemoteScreenPeer).
  const activeSessionId =
    joinedSessionId &&
    selectedSession?.id === joinedSessionId &&
    (selectedSession.status === "Accepted" || selectedSession.status === "Active")
      ? joinedSessionId
      : null;

  const screenPeer = useRemoteScreenPeer({ activeSessionId, iceServers, sendOffer, sendIceCandidate });

  const handleRequestSession = useCallback(async () => {
    if (!selectedDevice) return;
    setRequesting(true);
    setSessionError(null);
    try {
      const session = await requestSession(selectedDevice.id);
      setSessionsByDevice((current) => ({ ...current, [selectedDevice.id]: session }));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "No se pudo solicitar la sesión");
    } finally {
      setRequesting(false);
    }
  }, [selectedDevice]);

  const handleEndSession = useCallback(async () => {
    if (!selectedDevice || !selectedSession) return;
    setSessionError(null);
    try {
      const session = await endSession(selectedSession.id);
      setSessionsByDevice((current) => ({ ...current, [selectedDevice.id]: session }));
      setJoinedSessionId((current) => (current === selectedSession.id ? null : current));
      setIceServers([]);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "No se pudo finalizar la sesión");
    }
  }, [selectedDevice, selectedSession]);

  return (
    <>
      <ConnectionBanner hubStatus={hubStatus} usingMockData={usingMockData} />

      <main className="app-main">
        <section className="app-main__list">
          <div className="app-main__list-header">
            <h2>Dispositivos</h2>
            <button type="button" className="secondary" onClick={refresh}>
              Actualizar
            </button>
          </div>
          <DeviceList devices={devices} selectedDeviceId={selectedDeviceId} onSelect={setSelectedDeviceId} />
        </section>

        <section className="app-main__detail">
          <DeviceDetail
            device={selectedDevice}
            session={selectedSession}
            requesting={requesting}
            error={sessionError}
            onRequestSession={handleRequestSession}
            onEndSession={handleEndSession}
            remoteStream={screenPeer.remoteStream}
            peerState={screenPeer.peerState}
            peerError={screenPeer.errorMessage}
            diagnosticsLoading={diagnosticsLoading}
            diagnosticsError={diagnosticsError}
            diagnosticsSnapshot={selectedDeviceId ? diagnosticsByDevice[selectedDeviceId] ?? null : null}
            diagnosticEvents={selectedDeviceId ? diagnosticEventsByDevice[selectedDeviceId] ?? [] : []}
          />
        </section>
      </main>
    </>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("devices");
  const isAdmin = user?.role === "Admin";

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Vision Support</h1>
          <p>Panel del técnico</p>
        </div>
        <div className="app-header__user">
          <span className="app-header__user-name">
            {user?.displayName} <span className="app-header__user-role">({user?.role})</span>
          </span>
          <button type="button" className="secondary" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {isAdmin && (
        <nav className="app-nav">
          <button
            type="button"
            className={view === "devices" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"}
            onClick={() => setView("devices")}
          >
            Dispositivos
          </button>
          <button
            type="button"
            className={view === "pairing" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"}
            onClick={() => setView("pairing")}
          >
            Emparejar
          </button>
          <button
            type="button"
            className={view === "users" ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"}
            onClick={() => setView("users")}
          >
            Usuarios
          </button>
        </nav>
      )}

      {view === "users" && isAdmin ? (
        <main className="app-main app-main--single">
          <UsersAdmin />
        </main>
      ) : view === "pairing" && isAdmin ? (
        <main className="app-main app-main--single">
          <PairDeviceAdmin />
        </main>
      ) : (
        <DevicesPanel />
      )}
    </div>
  );
}

function App() {
  const { status } = useAuth();

  useEffect(() => {
    tryRestoreSession();
  }, []);

  if (status === "loading") {
    return (
      <div className="app-shell app-shell--centered">
        <p>Cargando…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginScreen />;
  }

  return <AuthenticatedApp />;
}

export default App;
