import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { interviewWsService } from '@/services/interview-ws.service';
import { APP_CONFIG } from '@/config/app.config';
import { useRemoteStreamRecorder } from '@/hooks/useRemoteStreamRecorder';
import { mobileUploadService } from '@/services/mobile-upload.service';
import { recordingSync } from '@/services/recording-sync.service';

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

    /**
     * Whether the candidate has read the recording notice and agreed to share
     * the camera. Nothing touches the camera until then, so the browser's own
     * permission prompt arrives with context instead of out of nowhere.
     */
    const [consented, setConsented] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const consentedRef = useRef(false);
    /** Set when the browser refused the camera, so we can say how to fix it. */
    const [cameraDenied, setCameraDenied] = useState(false);
    /** The open camera. State as well as a ref, because the recorder has to react to it changing. */
    const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
    /** Why the live picture to the computer is not up, shown without stopping the recording. */
    const [streamIssue, setStreamIssue] = useState<string | null>(null);

    /**
     * This phone's own recording.
     *
     * Made here, from the phone's own camera, and uploaded from here under the
     * pairing token — not recorded from the live picture on the computer. The
     * live picture is optional: it depends on a peer connection that can fail
     * for reasons nobody can fix from the phone, and a recording that depended
     * on it was lost whenever it did. This one exists either way.
     */
    const recorder = useRemoteStreamRecorder({
        stream: captureStream,
        enabled: verified && PROCTORING_CONFIG.recording.mobile.required && !finished,
        token,
        segmentMs: APP_CONFIG.RECORDING_SEGMENT_MINUTES > 0 ? APP_CONFIG.RECORDING_SEGMENT_MINUTES * 60_000 : undefined,
        onStarted: () => {
            if (token) void mobileUploadService.sendEvent(token, 'mobile_recording_started', 'Phone recording started');
        },
        onProblem: (message) => {
            console.warn('Phone recording:', message);
            if (token) void mobileUploadService.sendEvent(token, 'mobile_recording_issue', message);
        },
    });
    const recorderRef = useRef(recorder);
    recorderRef.current = recorder;

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

    // The camera: one stream, shared by the preview, the recording and the live
    // picture. They used to open it separately, and a phone only ever lets one
    // of them have it — the others got a dead track.
    useEffect(() => {
        if (!consented) return;
        let stream: MediaStream | null = null;
        let cancelled = false;
        async function startCamera() {
            const video = {
                facingMode,
                // A video call's worth: this is evidence of the room, not footage,
                // and it is sent over the candidate's own mobile data.
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 },
            };
            try {
                // The microphone too where the phone's recording is wanted: the
                // sound in the room is part of what it shows. The preview element
                // is muted, so it cannot feed back.
                const wantAudio = PROCTORING_CONFIG.recording.mobile.required;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video,
                        audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false,
                    });
                } catch (err) {
                    if (!wantAudio) throw err;
                    // Microphone refused: record without it rather than not at all.
                    stream = await navigator.mediaDevices.getUserMedia({ video });
                }
                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                setCaptureStream(stream);
                setCameraDenied(false);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                // Already connected to the computer (the camera was switched):
                // give the live picture the new camera.
                const connection = peerConnectionRef.current;
                if (connection) {
                    connection.getSenders().forEach((sender) => {
                        const next = stream?.getTracks().find((track) => track.kind === sender.track?.kind);
                        if (next) void sender.replaceTrack(next);
                    });
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                if (!cancelled) {
                    setCameraDenied(true);
                    // On the interview's record: a required recording that could not
                    // start is something the reviewer needs to see, not infer.
                    if (token && PROCTORING_CONFIG.recording.mobile.required) {
                        const why = err instanceof DOMException ? `${err.name}: ${err.message}` : String(err);
                        void mobileUploadService.sendEvent(token, 'mobile_recording_not_started',
                            `Phone recording is required but the camera could not be opened (${why})`);
                    }
                }
            }
        }
        void startCamera();
        return () => {
            cancelled = true;
            stream?.getTracks().forEach(track => track.stop());
            if (streamRef.current === stream) streamRef.current = null;
            setCaptureStream((current) => (current === stream ? null : current));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facingMode, consented]);

    // Keep the screen on while recording. A phone that dims and locks stops the
    // camera, and an interview's recording ended there.
    useEffect(() => {
        if (!verified || finished) return;
        type WakeLockSentinelLike = { release: () => Promise<void> };
        const wakeLock = (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
        if (!wakeLock) return;
        let sentinel: WakeLockSentinelLike | null = null;
        let cancelled = false;
        const acquire = () => {
            wakeLock.request('screen').then((lock) => {
                if (cancelled) void lock.release();
                else sentinel = lock;
            }).catch(() => { /* refused: nothing to do about it from here */ });
        };
        acquire();
        // The lock is dropped whenever the page is hidden; take it again on return.
        const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            void sentinel?.release();
        };
    }, [verified, finished]);

    // Finish anything an earlier visit to this page left unsent — a tab closed
    // or a phone that lost signal part-way through.
    useEffect(() => {
        if (token) void recordingSync.resume({ token });
    }, [token]);

    const acceptConsent = () => {
        consentedRef.current = true;
        setConsented(true);
    };

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
                    // 401/403/404 mean the QR link is no longer valid; retrying
                    // cannot help, so tell the candidate to rescan.
                    if (res.status === 401 || res.status === 403 || res.status === 404) {
                        setCheckMessage('This pairing link has expired. Please scan the QR code on your computer again.');
                        return;
                    }
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
                const data = await res.json();
                // The server could not run the check at all (its AI provider
                // failed). That is not the candidate's room, so say so rather
                // than telling them to reposition the phone.
                if (data.valid === false && /could not be run|unavailable|error/i.test(data.reason ?? '')) {
                    setCheckMessage('The room check is temporarily unavailable. Please wait a moment and tap Verify My Room again.');
                    return;
                }
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
        void endSession('exited');
    };

    /**
     * Whether a start is already in flight.
     *
     * <p>`ready` can now arrive more than once — the backend sends one the
     * moment both sides are registered, and the interview page sends another
     * a second later as a retry. Two overlapping starts would open the camera
     * twice and send two offers, and the desktop would answer the one that
     * lost.</p>
     */
    const startingRef = useRef(false);

    const startStreaming = async () => {
        // The desktop's ready signal can beat the candidate's consent; the
        // camera must not open before they have agreed.
        if (!consentedRef.current) return;
        // An established connection does not need rebuilding. A dead one does
        // — the desktop reloading is exactly when the phone must renegotiate
        // rather than sit on a peer connection nothing is listening to.
        const existing = peerConnectionRef.current;
        if (existing) {
            const state = existing.connectionState;
            if (state === 'new' || state === 'connecting' || state === 'connected') {
                console.log('Ignoring ready signal: already paired', state);
                return;
            }
            existing.close();
            peerConnectionRef.current = null;
        }
        if (startingRef.current) return;
        startingRef.current = true;

        try {
            // The camera is already open and, once verified, recording; the live
            // picture shares it. It may not be ready the instant the computer asks.
            let mediaStream = streamRef.current;
            for (let waited = 0; !mediaStream && waited < 10_000; waited += 250) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                mediaStream = streamRef.current;
            }
            if (!mediaStream) throw new Error('The camera is not ready');
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionRef.current = pc;

            // Picture always. Sound only where the phone is offered to the computer
            // as a microphone — the recording keeps the sound either way, and sending
            // it would let the candidate answer through a phone they may have
            // propped across the room.
            mediaStream.getTracks()
                .filter(track => track.kind === 'video' || PROCTORING_CONFIG.mobileCompanion.audio)
                .forEach(track => pc.addTrack(track, mediaStream));

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
            // Not an alert, and not an error: the live picture is optional. An alert
            // covers the camera preview, and this phone is still recording.
            console.error('Streaming start error:', err);
            setStreamIssue('The live picture to your computer could not start. This phone is still recording.');
        } finally {
            // Cleared either way: a start that failed on a denied camera must
            // not lock out the retry the candidate gets after allowing it.
            startingRef.current = false;
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
        // Whenever the room is verified and the interview has not ended — not only
        // while the live picture is up. The photos are kept as evidence now, and
        // a stream that failed to connect is exactly when they matter most.
        if (verified && !finished) {
            interval = window.setInterval(monitorRoom, 20000); // Check every 20 seconds
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [verified, finished, token]);

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
     * Close the recording and hand its last part to the uploader, *then* release
     * the camera. The other way round, stopping the tracks ends the recorder
     * mid-flush and the last seconds are lost.
     */
    const endSession = useCallback(async (reason: 'ended' | 'exited') => {
        try {
            await recorderRef.current.stopAndFinish(recorderRef.current.hasStarted());
        } catch (err) {
            console.warn('The phone recording could not be closed cleanly:', err);
        }
        shutDown();
        setFinished(reason);
    }, [shutDown]);

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
            void endSession('ended');
        };
        interviewWsService.subscribe('/user/queue/mobile/ended', onEnded);
        return () => interviewWsService.unsubscribe('/user/queue/mobile/ended');
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!consented) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
                <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl space-y-4">
                    <h1 className="text-xl font-bold text-gray-800">Before you connect</h1>
                    <p className="text-sm text-gray-600">
                        This phone will act as a second camera for your proctored interview.
                    </p>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
                        <li>Tap <b>Allow</b> when your browser asks for camera (and microphone) access.</li>
                        <li>Your phone will show a camera-in-use indicator while the feed is shared with the interview.</li>
                        <li>Place the phone so it shows you and your computer screen, then tap <b>Verify My Room</b>.</li>
                        <li>Keep this page open until the interview finishes.</li>
                    </ol>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 space-y-1">
                        <p className="font-semibold">This session is recorded</p>
                        <p>
                            The camera feed and audio are recorded for interview integrity, in line with our
                            Privacy Policy. Do not screenshot, screen-record, photograph or otherwise copy or
                            share any interview content. Doing so may invalidate your interview.
                        </p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="mt-0.5 h-4 w-4"
                        />
                        <span>I understand and agree to share my camera and to being recorded.</span>
                    </label>
                    <button
                        onClick={acceptConsent}
                        disabled={!agreed}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95"
                    >
                        Allow camera &amp; continue
                    </button>
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
                            {cameraDenied && (
                                <div className="rounded-xl border border-red-300 bg-red-50 p-3">
                                    <p className="text-sm text-red-900">
                                        Camera access was blocked. Open your browser's site settings (the lock
                                        icon beside the address bar), set Camera to <b>Allow</b>, then reload this page.
                                    </p>
                                </div>
                            )}
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
                                {PROCTORING_CONFIG.recording.mobile.required
                                    ? 'This phone is recording the room and sending the recording to your interview.'
                                    : 'Your mobile camera is set up for the interview.'}
                            </p>
                            {/* The live picture is a bonus: it may take a moment, or not
                                connect at all, and the recording does not depend on it. */}
                            {streaming ? (
                                <p className="text-xs text-green-700">Your computer can also see this phone live.</p>
                            ) : (
                                <p className="text-xs text-gray-500">
                                    The live picture on your computer is optional and connects when it is ready.
                                </p>
                            )}
                            {streamIssue && !streaming && (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                                    <p className="text-sm text-amber-900">{streamIssue}</p>
                                </div>
                            )}
                            {PROCTORING_CONFIG.recording.mobile.required && (
                                <p className="text-xs text-gray-500">
                                    Keep the screen on and this page open until the interview finishes. Use Wi-Fi if you can.
                                </p>
                            )}
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
