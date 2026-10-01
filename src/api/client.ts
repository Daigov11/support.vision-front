import { ensureFreshAccessToken, getAccessToken } from "../auth/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5080";

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function rawFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options?.headers),
  });
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response = await rawFetch(path, options);

  if (response.status === 401) {
    // El access token expiró (o nunca se refrescó a tiempo): un intento de renovación
    // silenciosa antes de darnos por vencidos. Si falla, authStore ya deja la sesión en
    // "unauthenticated" y la UI vuelve sola a la pantalla de login.
    try {
      await ensureFreshAccessToken();
      response = await rawFetch(path, options);
    } catch {
      // Se deja que el 401 original se convierta en el error de abajo.
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
