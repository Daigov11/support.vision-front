# Panel web — Vision Support

Panel del técnico (React + TypeScript + Vite). Lista dispositivos, muestra su estado
(online/offline/en sesión), permite solicitar una sesión de soporte y **recibe y renderiza
en vivo** la pantalla transmitida por Android vía WebRTC (el panel solo recibe vídeo: nunca
llama a `getUserMedia`, no hay audio, ni control remoto, ni archivos).

## Requisitos

- Node.js 20+

## Ejecutar en local

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Por defecto se sirve en `http://localhost:5173` y espera el backend en
`http://localhost:5080` (configurable vía `VITE_API_BASE_URL` / `VITE_HUB_URL` en `.env`).

Si el backend no está disponible, la lista de dispositivos cae automáticamente a datos
mock (`src/mock/devices.ts`) y se muestra un aviso en la parte superior.

## Autenticación

No hay registro público: el panel siempre arranca mostrando una pantalla de login
(`src/components/LoginScreen.tsx`) hasta que `POST /api/auth/login` responde con éxito;
nunca se renderiza `DevicesPanel`/`UsersAdmin` para un usuario no autenticado (ver el
`switch` por `status` en `App()`, `src/App.tsx`). Las credenciales inválidas muestran
siempre el mismo mensaje genérico ("Email o contraseña incorrectos.") — el backend responde
igual (401 sin detalle) exista o no ese email, así que el panel tampoco puede distinguirlo.

- **`src/auth/authStore.ts`** — store manual (sin Redux/Context) que guarda el estado de
  sesión y expone `login`, `logout`, `tryRestoreSession`, `getAccessToken`. Se lee desde
  React con `src/auth/useAuth.ts` (`useSyncExternalStore`).
- **Dónde vive cada token — decisión deliberada para este MVP**:
  - **Access token: solo en memoria** (variable del módulo `authStore`, nunca en
    `localStorage`/`sessionStorage`/cookies). Se pierde al recargar la página a propósito:
    es lo que más limita el daño de un XSS, porque no hay ningún storage persistente del que
    un script inyectado pueda leerlo.
  - **Refresh token: en `localStorage`**. Esto sí es vulnerable a robo por XSS (cualquier
    script en la página puede leer `localStorage`), pero es lo que permite no forzar un
    login manual en cada recarga. Es la concesión pragmática del MVP: **antes de
    producción**, migrar el refresh token a una cookie `httpOnly` + `Secure` (que JavaScript
    no puede leer) emitida por el propio backend, servida solo por HTTPS — ver también
    `docs/local-development.md`.
  - El comentario extenso en la cabecera de `authStore.ts` documenta este razonamiento en el
    propio código, no solo aquí.
- **Refresh silencioso**: `tryRestoreSession()` (llamado una vez al montar `App`) intenta
  `POST /api/auth/refresh` con el refresh token guardado antes de mostrar el login — si tiene
  éxito, el usuario entra directo sin volver a escribir su contraseña. Además, el cliente
  REST (`src/api/client.ts`) intercepta cualquier `401` de la API, intenta un refresh una
  sola vez (`ensureFreshAccessToken()`, deduplicado si hay varias peticiones en vuelo) y
  reintenta la petición original; si el refresh también falla, cierra la sesión y vuelve al
  login.
- **Logout**: `logout()` revoca el refresh token en el backend (`POST /api/auth/logout`) y
  limpia el estado local (access token en memoria + refresh token de `localStorage`).
- **API y SignalR llevan el token**: `apiClient` añade `Authorization: Bearer <accessToken>`
  a toda petición; `useRemoteHub.ts` pasa `getAccessToken()` como `accessTokenFactory` de
  SignalR (ver `docs/signaling-protocol.md` sobre por qué el navegador no puede mandar
  cabeceras en el *handshake* de WebSocket).
- **Vista de usuarios** (`src/components/UsersAdmin.tsx`, pestaña "Usuarios" en la barra de
  navegación): solo visible si `user.role === "Admin"` (ver `AuthenticatedApp` en
  `src/App.tsx`); lista usuarios, crea técnicos/administradores, activa/desactiva cuentas y
  restablece contraseñas (`src/api/users.ts`, sobre `GET/POST /api/users` y
  `PATCH /api/users/{id}`). Un usuario `Support` nunca ve esta pestaña — y aunque llamara a
  la API directamente, el backend la rechaza con 403 (`[Authorize(Roles = "Admin")]`).

Verificado manualmente en navegador: login con credenciales inválidas (mensaje genérico),
login válido como Admin y como Support, pestaña "Usuarios" visible solo para Admin, creación
de un usuario `Support` desde el panel, activar/desactivar esa cuenta, logout (vuelve al
login), y la conexión SignalR estableciéndose con el `access_token` del usuario correcto en
cada caso (confirmado en los logs del cliente de SignalR, con el claim de rol esperado en
cada JWT).

## Emparejar dispositivo

Sección de Admin (`src/components/PairDeviceAdmin.tsx`, pestaña "Emparejar" — visible solo si
`user.role === "Admin"`, igual que "Usuarios") para generar y administrar los códigos de
emparejamiento de un solo uso que Android necesita para obtener su `pairingKey` — ya no hay
alta automática de dispositivos (ver `../server/README.md` y `../docs/local-development.md`).

- **"Generar código"** (`POST /api/pairing-codes`, opcionalmente con un nombre para el
  dispositivo esperado) muestra, en una tarjeta: el código en texto plano, una cuenta regresiva
  hasta que vence (10 minutos, recalculada cada segundo a partir de `expiresAt`), un QR
  (`qrcode.react`) que codifica `vision-support://pair?code=<codigo>` — un formato no secreto
  pensado para un futuro lector de cámara en Android, que en este hito solo permite introducir
  el código a mano — y una advertencia de que el código solo funciona una vez.
- **El código nunca se guarda en `localStorage`** ni en ningún otro storage persistente: vive
  solo en estado de React (`justCreated`), así que desaparece de la UI en cuanto se recarga la
  página o se genera uno nuevo — igual que en el backend, que tampoco lo conserva en texto
  plano. Si un admin necesita el código de nuevo, no hay forma de recuperarlo: hay que revocar
  el anterior (opcional) y generar uno nuevo.
- **Lista de códigos** (`GET /api/pairing-codes`, refrescada cada 15 s y tras cada acción):
  nombre, estado (`Activo`/`Usado`/`Revocado`/`Vencido`), fechas de creación/vencimiento y el
  dispositivo asociado una vez usado. Un código `Activo` puede revocarse
  (`POST /api/pairing-codes/{id}/revoke`); los demás estados no muestran esa acción.

## Diagnóstico

Pestaña "Diagnóstico" en el detalle de cada dispositivo (`src/components/DeviceDetail.tsx`,
junto a "Soporte"), con tarjetas de batería, red (tipo + intensidad Wi-Fi si Android la reportó),
almacenamiento, modelo/versión de Android, versión de Vision Support, y estado del agente
(online/offline + última actualización) — más una línea de tiempo de eventos. Nunca muestra
Logcat ni datos de otras apps: solo lo que `server/Dtos/DeviceDiagnosticsDtos.cs` expone.

- **Carga inicial por REST** (`src/api/diagnostics.ts`, `GET /api/devices/{id}/diagnostics[/events]`)
  al seleccionar un dispositivo: el hub de SignalR solo empuja actualizaciones *nuevas*, no hace
  backfill del estado/histórico ya existente.
- **Actualización en vivo por SignalR** (`DeviceDiagnosticsUpdated`/`DeviceDiagnosticEventReceived`
  en `useRemoteHub.ts`): cuando Android envía un snapshot nuevo o un evento inmediato, la tarjeta
  o la línea de tiempo se actualizan solas, sin recargar la página ni volver a pedir por REST.
  Los eventos en memoria se acotan a los últimos 50 por dispositivo (el backend ya los pagina/poda
  según su propia retención).
- **Fuente de cada evento** (`src/components/DeviceDiagnostics.tsx`): "Vision Support" para los
  tres tipos propios del agente (`NetworkChanged`/`BatteryCritical`/`AgentError`), o
  `paquete (vVersión)` para los cuatro tipos de una app integrada vía el SDK `VisionDiagnostics`
  (`ApplicationInfo`/`ApplicationWarning`/`ApplicationError`/`ApplicationException` — ver
  `android/vision-diagnostics-sdk/README.md`). El `code` opcional de la app fuente se muestra
  como una etiqueta junto al tipo.
- **Filtros** por fuente, nivel (Info/Advertencia/Error — los 7 tipos se agrupan en estos 3
  niveles, ver `eventLevel()` en `DeviceDiagnostics.tsx`) y rango de fechas, todos client-side
  sobre los eventos ya cargados/recibidos. El filtro de fecha usa `occurredAt` cuando existe (el
  instante real según el reloj del dispositivo fuente) en vez de `createdAt`, porque un evento
  encolado sin conexión puede llegar al backend bastante después de haber ocurrido.
- **Nunca renderiza HTML sin sanitizar**: el mensaje de un evento (que puede venir de una app
  integrada, no solo del propio agente) se interpola como texto plano de React — nunca se usa
  `dangerouslySetInnerHTML` en ningún punto de este componente.
- **Estados comprensibles**: cargando, error de red/API, "todavía no reportó ningún diagnóstico"
  (dispositivo real pero sin snapshot aún — el backend responde `204`, no un error), y
  "desconectado y sin diagnóstico" cuando el dispositivo nunca llegó a conectarse.

Verificado con un emulador Android real emparejado: las seis tarjetas se poblaron con datos
reales al conectar; eventos de prueba propios del agente (cambio de red y batería crítica,
simulados con `adb shell dumpsys battery`/alternar Wi-Fi) y un evento de una app integrada
(`vision-diagnostics-demo`, botón "Simular error") aparecieron en la línea de tiempo del panel
sin recargar la página, con fuente, mensaje y marca de tiempo correctos.

## Estructura

- `src/types/` — tipos compartidos (`Device`, `RemoteSession`, mensajes de señalización,
  `UserDto`/roles en `types/auth.ts`).
- `src/auth/` — `authStore.ts` (estado de sesión, tokens, login/logout/refresh) y
  `useAuth.ts` (`useSyncExternalStore` para leerlo desde componentes).
- `src/api/` — cliente REST (`fetch`) hacia el backend; `client.ts` añade el Bearer token y
  reintenta una vez tras refrescar en un 401; `users.ts` para `/api/users`, `pairingCodes.ts`
  para `/api/pairing-codes`, `diagnostics.ts` para `/api/devices/{id}/diagnostics[/events]`.
- `src/components/LoginScreen.tsx` / `UsersAdmin.tsx` / `PairDeviceAdmin.tsx` — pantalla de
  login y las dos vistas de administración (solo Admin); ver [Autenticación](#autenticación) y
  [Emparejar dispositivo](#emparejar-dispositivo) arriba.
- `src/components/DeviceDiagnostics.tsx` — tarjetas + línea de tiempo de la pestaña
  "Diagnóstico" (ver [Diagnóstico](#diagnóstico) arriba); renderizada desde `DeviceDetail.tsx`.
- `src/hooks/useDevices.ts` — carga dispositivos, con fallback a mock.
- `src/hooks/useRemoteHub.ts` — conexión SignalR al `RemoteHub`: `joinSession`, `sendOffer`,
  `sendIceCandidate`, `getTurnCredentials`, y los eventos `ReceiveAnswer`/`ReceiveIceCandidate`.
- `src/webrtc/RemoteScreenPeer.ts` — lado ofertante de WebRTC (`RTCPeerConnection`
  `recvonly`), desacoplado de React y de SignalR (recibe `sendOffer`/`sendIceCandidate` por
  inyección). Registra `ontrack`/`onicecandidate`/`onconnectionstatechange`/
  `oniceconnectionstatechange` antes de crear la oferta, y encola candidatos ICE remotos que
  lleguen antes de fijar la descripción remota.
- `src/hooks/useRemoteScreenPeer.ts` — gestiona el ciclo de vida de un `RemoteScreenPeer`
  atado a `activeSessionId`: crea uno nuevo cuando cambia, cierra el anterior en cualquier
  otro caso (sesión finalizada/rechazada, dispositivo distinto, hub desconectado, desmontaje).
- `src/components/RemoteVideo.tsx` — `<video autoPlay playsInline muted>` que sincroniza
  `srcObject` con el stream remoto; placeholder cuando no hay stream.
- `src/components/` — `DeviceList`, `DeviceDetail`, `StatusBadge`, `ConnectionBanner`.

### Estados del vídeo

`DeviceDetail` combina el estado de la sesión (`Requested`/`Accepted`/`Rejected`/`Ended`) con
el estado del peer (`negotiating`/`connected`/`video-active`/`disconnected`/`error`) en una
sola etiqueta: "Esperando a que el dispositivo acepte…", "Negociando conexión WebRTC…",
"Conectado, esperando vídeo…", "Vídeo activo", "Conexión de vídeo perdida", etc.

### TURN / Coturn

El panel obtiene credenciales TURN efímeras antes de crear el `RemoteScreenPeer` de cada
sesión: en `App.tsx`, el handler de `onSessionResponded` encadena `joinSession(sessionId)` →
`getTurnCredentials(sessionId)` (ambos en `useRemoteHub.ts`) y solo entonces marca la sesión
como "unida" — eso es lo que dispara `useRemoteScreenPeer` a crear el peer, así que
`iceServers` ya está listo en ese momento (nunca se vuelve a pedir dentro del hook). Las
credenciales se guardan en estado de React (`iceServers` en `App.tsx`) solo mientras dura la
sesión: se limpian (`setIceServers([])`) al finalizar, cambiar de sesión, o perder la conexión
con el hub. `getTurnCredentials`/`RemoteScreenPeer` nunca registran `username`/`credential` en
consola.

Si `JoinSession` o `GetTurnCredentials` fallan, no se crea ningún `RemoteScreenPeer` (no hay
nada que liberar) y se muestra un error en el panel; no hay una ruta que degrade
silenciosamente a "solo P2P" cuando TURN falla.

Requiere que `infra/` tenga Coturn activo y `TURN_PUBLIC_HOST`/`TURN_EXTERNAL_IP` configurados
con una IP alcanzable por ambos clientes (la IP LAN de tu máquina para probar con el emulador o
un teléfono Android — nunca `localhost`; ver `infra/coturn/README.md` y
`docs/local-development.md`).

## Comprobaciones

```bash
npm run lint     # oxlint
npx tsc -b       # type-check (también se ejecuta como parte de `npm run build`)
npm run build    # build de producción
```
