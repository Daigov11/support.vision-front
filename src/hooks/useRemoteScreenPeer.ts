import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteScreenPeer } from "../webrtc/RemoteScreenPeer";
import type { OutgoingIceCandidate, RemoteScreenPeerState } from "../webrtc/RemoteScreenPeer";
import type { AnswerMessage, IceCandidateMessage } from "../types/signaling";

interface UseRemoteScreenPeerOptions {
  /**
   * Id de la sesión para la que el panel ya completó JoinSession, o null si no hay
   * ninguna sesión activa/autorizada en este momento (sin sesión, rechazada, finalizada,
   * dispositivo distinto al seleccionado, o hub desconectado). Cambiar este valor cierra
   * cualquier peer anterior antes de (si corresponde) abrir uno nuevo.
   */
  activeSessionId: string | null;
  /**
   * Credenciales TURN efímeras ya obtenidas para `activeSessionId` (ver
   * useRemoteHub.getTurnCredentials), o `[]` para forzar solo P2P directo. Deben estar listas
   * ANTES de que `activeSessionId` deje de ser null: este hook las lee en el mismo efecto que
   * crea el RemoteScreenPeer, no las vuelve a pedir.
   */
  iceServers: RTCIceServer[];
  sendOffer: (sessionId: string, sdp: string) => Promise<void>;
  sendIceCandidate: (sessionId: string, candidate: OutgoingIceCandidate) => Promise<void>;
}

export interface RemoteScreenPeerApi {
  remoteStream: MediaStream | null;
  peerState: RemoteScreenPeerState | null;
  errorMessage: string | null;
  handleRemoteAnswer: (message: AnswerMessage) => void;
  handleRemoteIceCandidate: (message: IceCandidateMessage) => void;
}

/**
 * Gestiona el ciclo de vida de un RemoteScreenPeer atado a `activeSessionId`. No conoce
 * SignalR: recibe sendOffer/sendIceCandidate ya resueltos (ver useRemoteHub) y expone
 * handlers para que el llamador conecte ReceiveAnswer/ReceiveIceCandidate del hub.
 */
export function useRemoteScreenPeer({
  activeSessionId,
  iceServers,
  sendOffer,
  sendIceCandidate,
}: UseRemoteScreenPeerOptions): RemoteScreenPeerApi {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerState, setPeerState] = useState<RemoteScreenPeerState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const peerRef = useRef<RemoteScreenPeer | null>(null);

  // Refs para no reiniciar el efecto de abajo cada vez que estas funciones/valores cambian de
  // identidad entre renders (App.tsx las recrea a menudo).
  const sendOfferRef = useRef(sendOffer);
  const sendIceCandidateRef = useRef(sendIceCandidate);
  const iceServersRef = useRef(iceServers);
  useEffect(() => {
    sendOfferRef.current = sendOffer;
    sendIceCandidateRef.current = sendIceCandidate;
    iceServersRef.current = iceServers;
  }, [sendOffer, sendIceCandidate, iceServers]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setErrorMessage(null);
    setRemoteStream(null);

    const peer = new RemoteScreenPeer({
      sessionId: activeSessionId,
      // El llamador (App.tsx) ya obtuvo estas credenciales (getTurnCredentials) antes de que
      // activeSessionId dejara de ser null, así que iceServersRef.current ya está actualizado.
      iceServers: iceServersRef.current,
      onStateChange: setPeerState,
      onRemoteStream: setRemoteStream,
      onError: (err) => setErrorMessage(err.message),
      sendOffer: (sessionId, sdp) => sendOfferRef.current(sessionId, sdp),
      sendIceCandidate: (sessionId, candidate) => sendIceCandidateRef.current(sessionId, candidate),
    });
    peerRef.current = peer;

    peer.start().catch((err) => {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo iniciar la conexión WebRTC");
    });

    return () => {
      peer.close();
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setRemoteStream(null);
      setPeerState(null);
    };
  }, [activeSessionId]);

  const handleRemoteAnswer = useCallback((message: AnswerMessage) => {
    const peer = peerRef.current;
    if (peer && peer.sessionId === message.sessionId) {
      peer.applyAnswer(message.sdp).catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "No se pudo aplicar la respuesta remota");
      });
    }
  }, []);

  const handleRemoteIceCandidate = useCallback((message: IceCandidateMessage) => {
    const peer = peerRef.current;
    if (peer && peer.sessionId === message.sessionId) {
      peer
        .addRemoteIceCandidate({
          candidate: message.candidate,
          sdpMid: message.sdpMid,
          sdpMLineIndex: message.sdpMLineIndex,
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : "No se pudo aplicar el candidato ICE remoto");
        });
    }
  }, []);

  return { remoteStream, peerState, errorMessage, handleRemoteAnswer, handleRemoteIceCandidate };
}
