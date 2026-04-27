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

    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

    useEffect(() => {
        if (!token) return;

        console.log('Connecting to WebSocket with token:', token);

        // Connect WebSocket using token (no scheduleId)
        interviewWsService.connect({
            mobileToken: token,   // use mobileToken
            onConnect: () => {
                interviewWsService.send('/app/mobile/register', { token });

                // Subscribe to desktop responses
                interviewWsService.subscribe('/user/queue/mobile/answer', (answer) => {
                    if (peerConnectionRef.current) {
                        peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                    }
                });
                interviewWsService.subscribe('/user/queue/mobile/ice', (data: { candidate: RTCIceCandidateInit; target: string }) => {
                    if (data.target === 'mobile' && data.candidate && peerConnectionRef.current) {
                        console.log('Mobile adding ICE candidate from desktop');
                        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
                            .catch(err => console.error('Error adding ICE candidate:', err));
                    }
                });
                interviewWsService.subscribe('/user/queue/mobile/ready', () => {
                    console.log('Desktop is ready signal received, starting stream');
                    startStreaming();
                });
            },
        });
        return () => interviewWsService.disconnect();
    }, [token]);

    // Start camera for verification preview
    useEffect(() => {
        let currentStream: MediaStream | null = null;
        async function startCamera() {
            try {
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = currentStream;
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
            }
        }
        startCamera();
        return () => {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode]);

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    const bypassVerification = () => {
        setVerified(true);
        alert('Verification skipped. Starting stream...');
        interviewWsService.send('/app/mobile/verified/' + token, { status: 'verified' });
        startStreaming();
    };

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

            const backendBaseUrl = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8082`;
            const url = `${backendBaseUrl}/api/mobile/verify-room?token=${token}`;

            try {
                const res = await fetch(url, { method: 'POST', body: formData });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
                const data = await res.json();
                if (data.valid) {
                    setVerified(true);
                    interviewWsService.send('/app/mobile/verified/' + token, { status: 'verified' });
                    startStreaming();
                } else {
                    alert('Verification failed. Please reposition the phone.');
                }
            } catch (err) {
                console.error('Verification fetch error:', err);
                alert('Verification error: ' + (err instanceof Error ? err.message : String(err)));
            }
        }, 'image/jpeg');
    };

    const startStreaming = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode }
            });
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionRef.current = pc;

            mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Mobile sending ICE candidate to desktop');
                    interviewWsService.send('/app/mobile/ice/' + token, { candidate: event.candidate, target: 'desktop' });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log('Sending WebRTC offer to desktop');
            interviewWsService.send('/app/mobile/offer/' + token, pc.localDescription);
            setStreaming(true);
        } catch (err) {
            console.error('Streaming start error:', err);
            alert('Could not start video stream. Please check camera permissions.');
        }
    };

    const monitorRoom = async () => {
        if (!videoRef.current || !token) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const formData = new FormData();
            formData.append('photo', blob, 'monitor.jpg');
            const backendBaseUrl = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8082`;
            const url = `${backendBaseUrl}/api/mobile/monitor?token=${token}`;
            try {
                await fetch(url, { method: 'POST', body: formData });
            } catch (err) {
                console.error('Monitoring error:', err);
            }
        }, 'image/jpeg');
    };

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (streaming) {
            interval = setInterval(monitorRoom, 20000); // Check every 20 seconds
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [streaming, token]);

    useEffect(() => {
        return () => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }
        };
    }, []);

    return (
        <div className="min-h-screen p-4 bg-gray-50 flex flex-col items-center">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Mobile Proctoring</h1>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
                <div className="relative aspect-video bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    {streaming && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/80 px-3 py-1 rounded-full animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                            <span className="text-white text-xs font-bold uppercase">Live Proctoring</span>
                        </div>
                    )}
                </div>

                <div className="p-6 space-y-4">
                    {!verified ? (
                        <>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-semibold text-gray-800">Room Verification</h2>
                                    <button
                                        onClick={toggleCamera}
                                        className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                        Switch to {facingMode === 'user' ? 'Back' : 'Front'}
                                    </button>
                                </div>
                                <p className="text-sm text-gray-600">
                                    Position the phone to show both you and the computer screen.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={takePhoto}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
                                >
                                    Verify My Room
                                </button>
                                <button
                                    onClick={bypassVerification}
                                    className="w-full border-2 border-indigo-600 text-indigo-600 font-bold py-2 rounded-xl hover:bg-indigo-50 transition-all text-sm"
                                >
                                    Skip Verification (Test Mode)
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4 space-y-4">
                            <div className="flex justify-end">
                                <button
                                    onClick={toggleCamera}
                                    className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center gap-1"
                                >
                                    Switch Camera
                                </button>
                            </div>
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-green-600">Verified & Secure</h2>
                            <p className="text-sm text-gray-600">
                                Your mobile camera is now providing a secure proctoring feed to the interview.
                            </p>
                            {!streaming && <p className="text-indigo-600 font-medium animate-pulse">Starting secure stream...</p>}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 text-center px-4">
                <p className="text-xs text-gray-400">
                    Keep this page open and your phone positioned correctly until the interview finishes.
                </p>
            </div>
        </div>
    );
}
