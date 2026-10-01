import { useMemo, useState } from "react";
import type { Device } from "../types/models";
import type { DeviceDiagnosticEventDto, DeviceHealthSnapshotDto, DiagnosticEventType } from "../types/diagnostics";
import { StatusBadge } from "./StatusBadge";

interface DeviceDiagnosticsProps {
  device: Device;
  loading: boolean;
  error: string | null;
  snapshot: DeviceHealthSnapshotDto | null;
  events: DeviceDiagnosticEventDto[];
}

type EventLevel = "Info" | "Warning" | "Error";

const VISION_SUPPORT_SOURCE = "__vision_support__";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function eventTypeLabel(type: DiagnosticEventType): string {
  switch (type) {
    case "NetworkChanged":
      return "Cambio de red";
    case "BatteryCritical":
      return "Batería crítica";
    case "AgentError":
      return "Error del agente";
    case "ApplicationInfo":
      return "Info de app";
    case "ApplicationWarning":
      return "Advertencia de app";
    case "ApplicationError":
      return "Error de app";
    case "ApplicationException":
      return "Excepción de app";
  }
}

/** Agrupa los 7 tipos de evento en 3 niveles simples para el filtro "Nivel". */
function eventLevel(type: DiagnosticEventType): EventLevel {
  switch (type) {
    case "NetworkChanged":
    case "ApplicationInfo":
      return "Info";
    case "BatteryCritical":
    case "ApplicationWarning":
      return "Warning";
    case "AgentError":
    case "ApplicationError":
    case "ApplicationException":
      return "Error";
  }
}

function levelLabel(level: EventLevel): string {
  switch (level) {
    case "Info":
      return "Info";
    case "Warning":
      return "Advertencia";
    case "Error":
      return "Error";
  }
}

/** "Vision Support" si no hay sourcePackage (evento propio del agente); si no, el paquete + versión. */
function sourceLabel(event: DeviceDiagnosticEventDto): string {
  if (!event.sourcePackage) return "Vision Support";
  return event.sourceAppVersion ? `${event.sourcePackage} (v${event.sourceAppVersion})` : event.sourcePackage;
}

function sourceKey(event: DeviceDiagnosticEventDto): string {
  return event.sourcePackage ?? VISION_SUPPORT_SOURCE;
}

export function DeviceDiagnostics({ device, loading, error, snapshot, events }: DeviceDiagnosticsProps) {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<EventLevel | "all">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const availableSources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of events) {
      seen.set(sourceKey(event), sourceLabel(event));
    }
    return Array.from(seen.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (sourceFilter !== "all" && sourceKey(event) !== sourceFilter) return false;
      if (levelFilter !== "all" && eventLevel(event.type) !== levelFilter) return false;

      // Se filtra por occurredAt cuando existe (el instante real, según el reloj del
      // dispositivo fuente) y por createdAt si no — un evento de app integrada puede haber
      // llegado tarde por la cola offline, y lo que le importa al técnico es cuándo pasó, no
      // cuándo llegó.
      const referenceDate = new Date(event.occurredAt ?? event.createdAt);
      if (dateFrom && referenceDate < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && referenceDate > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [events, sourceFilter, levelFilter, dateFrom, dateTo]);

  if (loading) {
    return <p className="empty-state">Cargando diagnóstico…</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!snapshot) {
    return (
      <p className="empty-state">
        {device.status === "Offline"
          ? "Este dispositivo está desconectado y todavía no reportó ningún diagnóstico."
          : "Todavía no llegó ningún reporte de diagnóstico de este dispositivo."}
      </p>
    );
  }

  return (
    <div className="diagnostics">
      <div className="diagnostics__cards">
        <div className="diagnostics__card">
          <h4>Batería</h4>
          <p>
            {snapshot.batteryPercent ?? "—"}%{snapshot.isCharging ? " · cargando" : ""}
          </p>
        </div>

        <div className="diagnostics__card">
          <h4>Red</h4>
          <p>{snapshot.networkConnected ? (snapshot.networkType ?? "Conectado") : "Desconectado"}</p>
          {snapshot.wifiSignalLevel !== null && <p className="diagnostics__card-detail">Señal Wi-Fi: {snapshot.wifiSignalLevel}/4</p>}
        </div>

        <div className="diagnostics__card">
          <h4>Almacenamiento</h4>
          <p>
            {formatBytes(snapshot.storageUsedBytes)} usados de {formatBytes(snapshot.storageTotalBytes)}
          </p>
          <p className="diagnostics__card-detail">{formatBytes(snapshot.storageAvailableBytes)} disponibles</p>
        </div>

        <div className="diagnostics__card">
          <h4>Dispositivo</h4>
          <p>
            {snapshot.manufacturer} {snapshot.model}
          </p>
          <p className="diagnostics__card-detail">{snapshot.androidVersion}</p>
        </div>

        <div className="diagnostics__card">
          <h4>Vision Support</h4>
          <p>Versión {snapshot.appVersion}</p>
        </div>

        <div className="diagnostics__card">
          <h4>Estado del agente</h4>
          <StatusBadge status={device.status} />
          <p className="diagnostics__card-detail">Última actualización: {formatDate(snapshot.receivedAt)}</p>
        </div>
      </div>

      <div className="diagnostics__events-header">
        <h3>Eventos</h3>
        {events.length > 0 && (
          <div className="diagnostics__filters">
            <label>
              Fuente
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Todas</option>
                {availableSources.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nivel
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as EventLevel | "all")}>
                <option value="all">Todos</option>
                <option value="Info">{levelLabel("Info")}</option>
                <option value="Warning">{levelLabel("Warning")}</option>
                <option value="Error">{levelLabel("Error")}</option>
              </select>
            </label>
            <label>
              Desde
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              Hasta
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <p className="empty-state">No hay eventos registrados para este dispositivo.</p>
      ) : filteredEvents.length === 0 ? (
        <p className="empty-state">Ningún evento coincide con los filtros seleccionados.</p>
      ) : (
        <ul className="diagnostics__timeline">
          {filteredEvents.map((event) => (
            <li key={event.id} className={`diagnostics__event diagnostics__event--${eventLevel(event.type).toLowerCase()}`}>
              <div className="diagnostics__event-header">
                <span className="diagnostics__event-type">{eventTypeLabel(event.type)}</span>
                <span className="diagnostics__event-source">{sourceLabel(event)}</span>
                {event.code && <span className="diagnostics__event-code">{event.code}</span>}
                <span className="diagnostics__event-time">{formatDate(event.occurredAt ?? event.createdAt)}</span>
              </div>
              {/* Texto plano (interpolación de React, nunca dangerouslySetInnerHTML): un mensaje
                  de una app integrada no puede inyectar HTML/markup en el panel. */}
              <span className="diagnostics__event-message">{event.message ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
