import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { interviewWsService } from '@/services/interview-ws.service';

export default function MobileConnect() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [verified, setVerified] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        if (!token) return;
        // Connect WebSocket using token (no scheduleId)
        interviewWsService.connect({
            token, onConnect: () => {
                interviewWsService.send('/app/mobile/register', { token });
            }
        });
        return () => interviewWsService.disconnect();
    }, [token]);

    const takePhoto = async () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert('Failed to capture photo');
                return;
            }
            const formData = new FormData();
            formData.append('photo', blob, 'room.jpg');
            try {
                const res = await fetch(`/api/mobile/verify-room?token=${token}`, { method: 'POST', body: formData });
                const data = await res.json();
                if (data.valid) {
                    setVerified(true);
                    startStreaming();
                } else {
                    alert('Verification failed. Please reposition the phone.');
                }
            } catch (err) {
                console.error(err);
                alert('Verification error. Please try again.');
            }
        }, 'image/jpeg');
    };

    const startStreaming = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Attach stream to video element for local preview (optional)
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionRef.current = pc;

            mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    interviewWsService.send('/app/mobile/ice/' + token, { candidate: event.candidate, target: 'desktop' });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            interviewWsService.send('/app/mobile/offer/' + token, pc.localDescription);
            setStreaming(true);
        } catch (err) {
            console.error('Streaming start error:', err);
            alert('Could not start video stream. Please check camera permissions.');
        }
    };

    return (
        <div className="min-h-screen p-4">
            <h1 className="text-xl font-bold mb-4">Mobile Companion</h1>
            {!verified ? (
                <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg mb-4" />
                    <button onClick={takePhoto} className="bg-blue-500 text-white px-4 py-2 rounded">
                        Take Photo for Verification
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                        Position the phone so that both you and the screen are visible.
                    </p>
                </>
            ) : streaming ? (
                <p className="text-green-600">Streaming in progress...</p>
            ) : (
                <p>Starting stream...</p>
            )}
        </div>
    );
}