import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe, type AuthState } from "./authStore";

/** Suscribe el componente al estado de auth externo (authStore.ts) sin prop-drilling ni Context. */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
