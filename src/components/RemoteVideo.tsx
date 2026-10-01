import { useEffect, useRef } from "react";

interface RemoteVideoProps {
  stream: MediaStream | null;
  placeholderText: string;
}

/** Componente "tonto": solo sincroniza `srcObject` con el stream recibido por props. */
export function RemoteVideo({ stream, placeholderText }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="video-placeholder">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="remote-video"
        style={{ display: stream ? "block" : "none" }}
      />
      {!stream && <span>{placeholderText}</span>}
    </div>
  );
}
