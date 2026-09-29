import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { interviewWsService } from '@/services/interview-ws.service';

export default function MobileConnect() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [verified, setVerified] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    /** What the room check said, so the candidate knows what to change. */
    const [checkMessage, setCheckMessage] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    /** Set once the interview is over, or the candidate exits deliberately. */
    const [finished, setFinished] = useState<null | 'ended' | 'exited'>(null);
    /**
     * The live capture, held so it can actually be stopped.
     *
     * It was a local inside startStreaming, so nothing could release it: the
     * camera stayed on after the interview finished, with the phone warm and
     * its indicator lit, until the candidate thought to close the tab.
     */
    const streamRef = useRef<MediaStream | null>(null);

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
        const video = videoRef.current;
        if (!video || checking) return;

        // A phone fires this the moment the button is tapped, which on a slow
        // camera is before the first frame exists. videoWidth is 0 then, the
        // canvas is 0x0, and the blank JPEG that follows came back as "no
        // person visible" — a verification failure the candidate could not
        // fix by repositioning anything.
        if (video.readyState < 2 || video.videoWidth === 0) {
            setCheckMessage('The camera is still starting. Wait for the picture to appear, then try again.');
            return;
        }

        setChecking(true);
        setCheckMessage(null);

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setChecking(false);
            return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                setChecking(false);
                setCheckMessage('The photo could not be taken. Please try again.');
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
                    setCheckMessage(null);
                    interviewWsService.send('/app/mobile/verified/' + token, { status: 'verified' });
                    startStreaming();
                } else {
                    // The server's own words. "Reposition the phone" told the
                    // candidate nothing about what was wrong; "your screen is
                    // not visible" tells them exactly what to move.
                    setCheckMessage(data.reason || 'The room check did not pass. Please try again.');
                }
            } catch (err) {
                console.error('Verification fetch error:', err);
                setCheckMessage('Could not reach the room check. Check your connection and try again.');
            } finally {
                setChecking(false);
            }
        }, 'image/jpeg');
    };

    /** Leave deliberately: release the camera rather than abandoning the tab. */
    const exitProctoring = () => {
        shutDown();
        setFinished('exited');
    };

    const startStreaming = async () => {
        try {
            // Audio only on the streaming capture, never on the preview above:
            // the preview is attached to a video element on this same phone, and
            // an unmuted one would feed the microphone straight back into it.
            //
            // The desktop decides whether to record from this track — it arrives
            // as an offer, not an instruction — so sending it costs nothing when
            // the candidate keeps using their laptop microphone.
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode },
                audio: PROCTORING_CONFIG.mobileCompanion.audio
                    ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                    : false,
            });
            streamRef.current = mediaStream;
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
        // window.setInterval, not the bare global: the bare one is typed as
        // Node's and `NodeJS.Timeout` does not exist in a browser tsconfig, so
        // this file failed the typecheck on every run.
        let interval: number | null = null;
        if (streaming) {
            interval = window.setInterval(monitorRoom, 20000); // Check every 20 seconds
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [streaming, token]);

    /**
     * Release the camera and the connection, once.
     *
     * Safe to call twice — the candidate may hit Exit at the same moment the
     * desktop says the interview is over, and neither path should depend on
     * the other not having run.
     */
    const shutDown = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        setStreaming(false);
    }, []);

    /**
     * The desktop telling this phone the interview has finished.
     *
     * Subscribed separately from the signalling above because it has to stay
     * live for the whole session — the phone otherwise kept filming into an
     * interview that had already ended.
     */
    useEffect(() => {
        if (!token) return;
        const onEnded = () => {
            shutDown();
            setFinished('ended');
        };
        interviewWsService.subscribe('/user/queue/mobile/ended', onEnded);
        return () => interviewWsService.unsubscribe('/user/queue/mobile/ended');
    }, [token, shutDown]);

    useEffect(() => {
        return () => {
            shutDown();
        };
    }, [shutDown]);

    // Once it is over the phone has no job left, and leaving the live UI on
    // screen invites the candidate to keep holding it up at nothing.
    if (finished) {
        const ended = finished === 'ended';
        return (
            <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
                <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-gray-800">
                        {ended ? 'Interview complete' : 'Proctoring stopped'}
                    </h1>
                    <p className="mt-2 text-sm text-gray-600">
                        {ended
                            ? 'Your camera has been switched off and the feed has ended. You can close this page.'
                            : 'Your camera has been switched off. Reopen the QR code on your computer if you need to pair again.'}
                    </p>
                    <p className="mt-4 text-xs text-gray-400">It is safe to close this tab.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 bg-gray-50 flex flex-col items-center">
            <div className="mb-6 flex w-full max-w-md items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Mobile Proctoring</h1>
                {/* Leaving deliberately releases the camera. Closing the tab
                    does too, eventually, but a candidate who has finished
                    should not have to guess that. */}
                <button
                    onClick={exitProctoring}
                    title="Stop proctoring and switch off the camera"
                    aria-label="Exit proctoring"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 active:scale-95"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Exit
                </button>
            </div>

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
                            {/* The server's reason, where the alert used to be. An
                                alert on a phone covers the camera preview — the
                                one thing the candidate needs to see to fix the
                                problem it is describing. */}
                            {checkMessage && (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                                    <p className="text-sm text-amber-900">{checkMessage}</p>
                                </div>
                            )}
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={takePhoto}
                                    disabled={checking}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
                                >
                                    {checking ? 'Checking…' : 'Verify My Room'}
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
