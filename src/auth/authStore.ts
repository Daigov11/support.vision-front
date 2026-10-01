import type { AuthTokensResponse, UserDto } from "../types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5080";

// DECISIÓN (MVP) — dónde vive cada token, y por qué:
//
// - El ACCESS TOKEN vive SOLO en memoria (esta variable de módulo), nunca en localStorage ni
//   sessionStorage: así, si hay un XSS, un script inyectado no puede leerlo simplemente
//   inspeccionando el almacenamiento del navegador, y de recargar la página desaparece.
// - El REFRESH TOKEN si se guarda en localStorage, para que cerrar/recargar la pestaña no
//   obligue a volver a escribir la contraseña (se restaura la sesión en tryRestoreSession()).
//   Esto es un trade-off consciente para el MVP: localStorage SÍ es legible por cualquier script
//   que corra en la página (XSS), así que un ataque exitoso podría robar el refresh token y
//   renovar accesos mientras no se detecte el reuso (ver AuthController.Refresh: reutilizar un
//   refresh token ya rotado revoca TODA la sesión, lo que limita el daño una vez se detecta).
//   La alternativa más segura es una cookie HttpOnly+Secure puesta por el backend, pero eso
//   exige HTTPS y mismo-sitio (o CORS+SameSite=None+Secure) — con panel y backend en orígenes
//   distintos y HTTP en desarrollo local, complica el flujo sin aportar nada en local. Antes de
//   exponer esto fuera de tu máquina, cambia a cookies HttpOnly+Secure y sirve todo por HTTPS
//   (ver docs/local-development.md).
const REFRESH_TOKEN_STORAGE_KEY = "visionSupport.refreshToken";

// Refrescar ~60s antes de que expire el access token, para que las llamadas normales casi
// nunca tengan que pasar por el camino reactivo (401 -> refresh -> reintento) de api/client.ts.
const SILENT_REFRESH_MARGIN_MS = 60_000;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: UserDto | null;
}

let state: AuthState = { status: "loading", accessToken: null, user: null };
const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightRefresh: Promise<string> | null = null;

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AuthState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredRefreshToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Modo privado / cuota agotada: la sesión sigue funcionando en memoria para esta pestaña,
    // simplemente no sobrevive a un recargo. No es un error que deba romper el login.
  }
}

function applyTokens(tokens: AuthTokensResponse) {
  writeStoredRefreshToken(tokens.refreshToken);
  setState({ status: "authenticated", accessToken: tokens.accessToken, user: tokens.user });
  scheduleSilentRefresh(tokens.accessTokenExpiresAt);
}

function clearSession() {
  writeStoredRefreshToken(null);
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  setState({ status: "unauthenticated", accessToken: null, user: null });
}

function scheduleSilentRefresh(accessTokenExpiresAtIso: string) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const expiresAtMs = new Date(accessTokenExpiresAtIso).getTime();
  const delay = Math.max(expiresAtMs - Date.now() - SILENT_REFRESH_MARGIN_MS, 5_000);
  refreshTimer = setTimeout(() => {
    ensureFreshAccessToken().catch(() => {
      // refreshTokenRequest ya deja el estado en "unauthenticated" si falla; nada más que hacer.
    });
  }, delay);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Auth ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<void> {
  let tokens: AuthTokensResponse;
  try {
    tokens = await postJson<AuthTokensResponse>("/api/auth/login", { email, password });
  } catch {
    // Mismo mensaje que el backend usa para no revelar si el email existe.
    throw new Error("Email o contraseña incorrectos.");
  }
  applyTokens(tokens);
}

/** Llamado una vez al arrancar la app: intenta reanudar sesión con el refresh token guardado. */
export async function tryRestoreSession(): Promise<void> {
  const refreshToken = readStoredRefreshToken();
  if (!refreshToken) {
    setState({ status: "unauthenticated" });
    return;
  }
  try {
    await refreshTokenRequest(refreshToken);
  } catch {
    clearSession();
  }
}

async function refreshTokenRequest(refreshToken: string): Promise<string> {
  const tokens = await postJson<AuthTokensResponse>("/api/auth/refresh", { refreshToken }).catch((err) => {
    clearSession();
    throw err;
  });
  applyTokens(tokens);
  return tokens.accessToken;
}

/**
 * Usado por api/client.ts tras un 401, y por el refresco silencioso periódico. Deduplica
 * llamadas concurrentes: como el refresh token es de un solo uso (rotativo), si dos peticiones
 * reciben 401 a la vez, NO deben disparar dos /api/auth/refresh en paralelo (el segundo
 * fallaría porque el primero ya rotó/revocó el token).
 */
export function ensureFreshAccessToken(): Promise<string> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  const refreshToken = readStoredRefreshToken();
  if (!refreshToken) {
    clearSession();
    return Promise.reject(new Error("No hay sesión."));
  }
  inFlightRefresh = refreshTokenRequest(refreshToken).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

export async function logout(): Promise<void> {
  const refreshToken = readStoredRefreshToken();
  clearSession();
  if (refreshToken) {
    try {
      await postJson("/api/auth/logout", { refreshToken });
    } catch {
      // Best-effort: si la llamada falla, la sesión local ya quedó cerrada de todas formas.
    }
  }
}
