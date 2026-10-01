// Lado ofertante de WebRTC del panel técnico. No depende de React ni de SignalR: recibe
// las funciones para enviar señalización por inyección, y expone callbacks para que el
// consumidor (ver hooks/useRemoteScreenPeer.ts) reaccione a cambios de estado y al stream
// remoto. El panel SOLO recibe vídeo (recvonly): nunca llama a getUserMedia ni envía media.

export type RemoteScreenPeerState = "negotiating" | "connected" | "video-active" | "disconnected" | "error";

export interface OutgoingIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface RemoteScreenPeerOptions {
  sessionId: string;
  /** Credenciales TURN efímeras de RemoteHub.GetTurnCredentials (ver useRemoteHub), o `[]`
   * para forzar solo P2P directo (ver docs/architecture.md). */
  iceServers: RTCIceServer[];
  onStateChange: (state: RemoteScreenPeerState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onError: (error: Error) => void;
  sendOffer: (sessionId: string, sdp: string) => Promise<void>;
  sendIceCandidate: (sessionId: string, candidate: OutgoingIceCandidate) => Promise<void>;
}

function log(category: "SignalR" | "SDP" | "ICE" | "Track", message: string, ...rest: unknown[]) {
  console.debug(`[RemoteScreenPeer][${category}]`, message, ...rest);
}

/**
 * Una instancia por sesión de soporte. Crea la oferta, gestiona el intercambio de
 * candidatos ICE (encolando los que llegan antes de fijar la descripción remota) y
 * reporta el stream de vídeo remoto y el estado de la conexión.
 */
export class RemoteScreenPeer {
  readonly sessionId: string;

  private pc: RTCPeerConnection | null = null;
  private readonly options: RemoteScreenPeerOptions;
  private pendingRemoteCandidates: OutgoingIceCandidate[] = [];
  private remoteDescriptionSet = false;
  private hasRemoteStream = false;
  private closed = false;

  constructor(options: RemoteScreenPeerOptions) {
    this.sessionId = options.sessionId;
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.pc) {
      throw new Error("RemoteScreenPeer.start() ya fue llamado para esta instancia.");
    }

    const pc = new RTCPeerConnection({ iceServers: this.options.iceServers });
    this.pc = pc;

    // Los handlers se registran ANTES de crear la oferta para no perder eventos tempranos
    // (p. ej. candidatos ICE generados durante createOffer/setLocalDescription).
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      this.hasRemoteStream = Boolean(stream);
      log("Track", "ontrack", { kind: event.track.kind, streams: event.streams.length });
      this.options.onRemoteStream(stream ?? null);
      if (pc.connectionState === "connected" && this.hasRemoteStream) {
        this.options.onStateChange("video-active");
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        log("ICE", "recolección local de candidatos completa");
        return;
      }
      log("ICE", "candidato local generado, enviando", event.candidate.candidate);
      this.options
        .sendIceCandidate(this.sessionId, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        })
        .catch((err) => this.fail("SignalR", "no se pudo enviar el candidato ICE local", err));
    };

    pc.onconnectionstatechange = () => {
      log("ICE", "connectionState ->", pc.connectionState);
      switch (pc.connectionState) {
        case "connecting":
          this.options.onStateChange("negotiating");
          break;
        case "connected":
          this.options.onStateChange(this.hasRemoteStream ? "video-active" : "connected");
          break;
        case "failed":
          this.fail("ICE", "la conexión WebRTC falló (connectionState=failed)");
          break;
        case "disconnected":
        case "closed":
          if (!this.closed) {
            this.options.onStateChange("disconnected");
          }
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      log("ICE", "iceConnectionState ->", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        this.fail("ICE", "la negociación ICE falló (iceConnectionState=failed)");
      }
    };

    // recvonly: el panel nunca captura ni envía su propia cámara/pantalla.
    pc.addTransceiver("video", { direction: "recvonly" });

    this.options.onStateChange("negotiating");

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log("SDP", "oferta local creada y fijada");
      if (!offer.sdp) {
        throw new Error("createOffer() no devolvió SDP.");
      }
      await this.options.sendOffer(this.sessionId, offer.sdp);
      log("SignalR", "oferta enviada");
    } catch (err) {
      this.fail("SDP", "no se pudo crear/enviar la oferta", err);
    }
  }

  async applyAnswer(sdp: string): Promise<void> {
    if (!this.pc || this.closed) return;
    try {
      await this.pc.setRemoteDescription({ type: "answer", sdp });
      this.remoteDescriptionSet = true;
      log("SDP", "respuesta remota aplicada");

      const queued = this.pendingRemoteCandidates;
      this.pendingRemoteCandidates = [];
      for (const candidate of queued) {
        await this.addIceCandidateNow(candidate);
      }
    } catch (err) {
      this.fail("SDP", "no se pudo aplicar la respuesta remota", err);
    }
  }

  async addRemoteIceCandidate(candidate: OutgoingIceCandidate): Promise<void> {
    if (!this.pc || this.closed) return;
    if (!this.remoteDescriptionSet) {
      log("ICE", "descripción remota aún no fijada, encolando candidato");
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    await this.addIceCandidateNow(candidate);
  }

  private async addIceCandidateNow(candidate: OutgoingIceCandidate): Promise<void> {
    try {
      await this.pc?.addIceCandidate(candidate);
      log("ICE", "candidato remoto aplicado");
    } catch (err) {
      this.fail("ICE", "no se pudo aplicar el candidato ICE remoto", err);
    }
  }

  private fail(category: "SignalR" | "SDP" | "ICE" | "Track", message: string, err?: unknown) {
    if (this.closed) return;
    console.error(`[RemoteScreenPeer][${category}]`, message, err);
    this.options.onStateChange("error");
    this.options.onError(err instanceof Error ? err : new Error(message));
  }

  /** Idempotente: cierra la conexión, libera el stream y descarta candidatos pendientes. */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    this.pendingRemoteCandidates = [];
    this.options.onRemoteStream(null);
  }
}
