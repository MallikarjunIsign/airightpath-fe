import { useEffect, useRef } from "react";
import { interviewWsService } from "@/services/interview-ws.service";

export function useMobileStream(token: string | null, onConnected: () => void) {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!token) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onConnected();
        // the stream will be attached to a video element elsewhere
        // we can store it in a state or ref
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        interviewWsService.send("/app/mobile/ice/" + token, {
          candidate: event.candidate,
          target: "mobile",
        });
      }
    };

    // Subscribe to WebSocket messages
    const handleOffer = (offer: RTCSessionDescriptionInit) => {
      pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          interviewWsService.send(
            "/app/mobile/answer/" + token,
            pc.localDescription,
          );
        });
    };
    const handleIce = (candidate: RTCIceCandidateInit) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    };

    interviewWsService.subscribe("/user/queue/mobile/offer", handleOffer);
    interviewWsService.subscribe("/user/queue/mobile/ice", handleIce);

    return () => {
      pc.close();
      // unsubscribe...
    };
  }, [token, onConnected]);

  return peerConnectionRef.current;
}
