// Espejo en TypeScript de los mensajes tipados de Hubs/SignalingMessages.cs.
// El campo camelCase corresponde a la política de serialización JSON por defecto
// de SignalR/ASP.NET Core.

export interface DevicePresenceMessage {
  deviceId: string;
  deviceCode: string;
  status: string;
  timestamp: string;
}

export interface SessionRequestedMessage {
  sessionId: string;
  deviceId: string;
  technicianUserId: string;
  technicianName: string;
  requestedAt: string;
}

export interface SessionRespondedMessage {
  sessionId: string;
  deviceId: string;
  accepted: boolean;
  reason: string | null;
}

export interface OfferMessage {
  sessionId: string;
  sdp: string;
}

export interface AnswerMessage {
  sessionId: string;
  sdp: string;
}

export interface IceCandidateMessage {
  sessionId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface SessionEndedMessage {
  sessionId: string;
  reason: string | null;
}

// DeviceDiagnosticsUpdated/DeviceDiagnosticEventReceived (ver server/Hubs/RemoteHub.cs) llevan
// exactamente los mismos DTOs que las respuestas REST — ver types/diagnostics.ts, no hace falta
// duplicarlos aquí.

// Respuesta de RemoteHub.GetTurnCredentials (server/Dtos/TurnDtos.cs), no un evento del hub:
// es el resultado de connection.invoke("GetTurnCredentials", sessionId), no de connection.on().
export interface IceServerDto {
  urls: string[];
  username: string | null;
  credential: string | null;
}

export interface TurnCredentialsDto {
  iceServers: IceServerDto[];
  expiresAt: string;
}
