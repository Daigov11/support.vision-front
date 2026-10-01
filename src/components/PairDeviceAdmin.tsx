import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPairingCode, fetchPairingCodes, revokePairingCode } from "../api/pairingCodes";
import type { CreatePairingCodeResponse, PairingCodeDto } from "../types/pairing";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusLabel(status: PairingCodeDto["status"]): string {
  switch (status) {
    case "Active":
      return "Activo";
    case "Used":
      return "Usado";
    case "Revoked":
      return "Revocado";
    case "Expired":
      return "Vencido";
  }
}

function useCountdown(expiresAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return "Vencido";
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PairDeviceAdmin() {
  const [codes, setCodes] = useState<PairingCodeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [label, setLabel] = useState("");

  // Solo en memoria de React, nunca en localStorage: al recargar la página, el código en texto
  // plano desaparece para siempre (igual que en el backend, que tampoco lo conserva). Es
  // deliberado: si un admin necesita otro código, genera uno nuevo.
  const [justCreated, setJustCreated] = useState<CreatePairingCodeResponse | null>(null);
  const countdown = useCountdown(justCreated?.expiresAt ?? null);
  const isExpired = countdown === "Vencido";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCodes(await fetchPairingCodes());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los códigos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresca la lista periódicamente para que "Activo" pase a "Vencido" solo con el tiempo,
  // sin que el admin tenga que recargar la página a mano.
  const pollRef = useRef(load);
  useEffect(() => {
    pollRef.current = load;
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => pollRef.current(), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const created = await createPairingCode(label.trim() || undefined);
      setJustCreated(created);
      setLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el código.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokePairingCode(id);
      if (justCreated?.id === id) setJustCreated(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el código.");
    }
  };

  return (
    <div className="pair-device">
      <div className="pair-device__header">
        <h2>Emparejar dispositivo</h2>
      </div>

      <form className="pair-device__generate" onSubmit={handleGenerate}>
        <label>
          Nombre del dispositivo (opcional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="p. ej. Portátil de recepción"
          />
        </label>
        <button type="submit" disabled={generating}>
          {generating ? "Generando…" : "Generar código"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {justCreated && (
        <div className="pair-device__code-card">
          <div className="pair-device__code-value">{justCreated.code}</div>
          <div className={isExpired ? "pair-device__countdown pair-device__countdown--expired" : "pair-device__countdown"}>
            {isExpired ? "Este código venció" : `Válido por ${countdown}`}
          </div>
          <QRCodeSVG
            value={`vision-support://pair?code=${encodeURIComponent(justCreated.code)}`}
            size={160}
            marginSize={2}
          />
          <p className="pair-device__warning">
            Este código solo funciona una vez. No se volverá a mostrar tras recargar la página —
            si lo pierdes, genera uno nuevo.
          </p>
        </div>
      )}

      <h3>Códigos generados</h3>
      {loading ? (
        <p className="empty-state">Cargando…</p>
      ) : codes.length === 0 ? (
        <p className="empty-state">Todavía no generaste ningún código.</p>
      ) : (
        <table className="pairing-codes-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Vence</th>
              <th>Dispositivo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id}>
                <td>{code.label ?? "—"}</td>
                <td>
                  <span className={`pairing-status pairing-status--${code.status.toLowerCase()}`}>
                    {statusLabel(code.status)}
                  </span>
                </td>
                <td>{formatDate(code.createdAt)}</td>
                <td>{formatDate(code.expiresAt)}</td>
                <td>{code.deviceName ?? "—"}</td>
                <td>
                  {code.status === "Active" && (
                    <button type="button" className="secondary" onClick={() => handleRevoke(code.id)}>
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
