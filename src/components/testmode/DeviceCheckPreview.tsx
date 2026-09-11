import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle, Users, UserRound, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { NoiseLevelMeter } from '@/components/exam/NoiseLevelMeter';
import { ExamIdentityCheck, type FaceStatus } from '@/components/exam/ExamIdentityCheck';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useMicNoiseLevel } from '@/hooks/useMicNoiseLevel';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';

/** Face checks run fast here, as they do on the real screen — someone is waiting. */
const CHECK_INTERVAL_MS = 1000;
/** Give up on the face models rather than disabling the shutter forever. */
const MODEL_LOAD_TIMEOUT_MS = 15000;

/**
 * The pre-exam device and identity check, as a candidate meets it.
 *
 * This is the stage admins most often want to see and least often can: it needs
 * a real camera, a real face detector and a real shutter, so describing it in a
 * document never quite lands. The component runs all three for real and pairs
 * them with {@link ExamIdentityCheck} in its no-persist mode, so the photo is
 * taken and shown back but never uploaded.
 *
 * The camera is opened here and closed on unmount. Nothing survives the page.
 */
export function DeviceCheckPreview({
  onReadyChange,
}: Readonly<{
  /**
   * True once a photo has been taken and the room scan requirement is met.
   * Optional: the interview rehearsal shows this step without gating on it.
   */
  onReadyChange?: (ready: boolean) => void;
}>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelsTimedOut, setModelsTimedOut] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [roomScanSatisfied, setRoomScanSatisfied] = useState(false);

  const { isLoaded, faceDetected, multipleFaces, loadModels, startDetection, stopDetection } =
    useFaceDetection({
      // Reports only. Auto-submit is the exam's job, and there is no exam here.
      maxWarnings: Number.POSITIVE_INFINITY,
      checkIntervalMs: CHECK_INTERVAL_MS,
      noFaceConsecutiveFrames: 1,
      multipleFacesConsecutiveFrames: 1,
    });

  const noise = useMicNoiseLevel(stream);
  const faceCheckEnabled = PROCTORING_CONFIG.eyeDetection.enabled;

  // ── Camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const live = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          live.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = live;
        setStream(live);
        if (videoRef.current) videoRef.current.srcObject = live;
      } catch {
        if (!cancelled) {
          setCameraError(
            'Camera and microphone access was blocked. A candidate would be stopped here too — allow access and reload to continue.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopDetection();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // Mount-only: re-running this would open a second camera stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Face models ────────────────────────────────────────────────────
  useEffect(() => {
    if (!faceCheckEnabled) return;
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) setModelsTimedOut(true);
    }, MODEL_LOAD_TIMEOUT_MS);

    void loadModels().finally(() => {
      settled = true;
      window.clearTimeout(timeout);
    });

    return () => window.clearTimeout(timeout);
  }, [faceCheckEnabled, loadModels]);

  useEffect(() => {
    if (isLoaded && videoRef.current && stream) startDetection(videoRef.current);
  }, [isLoaded, stream, startDetection]);

  // ── Readiness ──────────────────────────────────────────────────────
  useEffect(() => {
    onReadyChange?.(photoTaken && roomScanSatisfied);
  }, [photoTaken, roomScanSatisfied, onReadyChange]);

  const handleRoomScanChange = useCallback((satisfied: boolean) => {
    setRoomScanSatisfied(satisfied);
  }, []);

  let faceStatus: FaceStatus = 'unknown';
  if (multipleFaces) faceStatus = 'multiple';
  else if (isLoaded) faceStatus = faceDetected ? 'single' : 'none';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Device check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cameraError ? (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--error)] bg-[var(--error)]/5 px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[var(--error)]" />
              <p className="text-sm text-[var(--text)]">{cameraError}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  {!stream && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                      <Camera size={20} className="text-white/60" />
                      <span className="text-[11px] text-white/80">Starting camera…</span>
                    </div>
                  )}
                </div>
                <StatusLine
                  ok={!!stream}
                  okText="Camera and microphone active"
                  pendingText="Waiting for camera"
                />
              </div>

              <div className="space-y-3">
                {/* Face state, worded as the candidate sees it. */}
                {faceCheckEnabled && (
                  <div className="space-y-2">
                    {modelsTimedOut && !isLoaded ? (
                      <p className="flex items-center gap-2 text-sm text-[var(--warning)]">
                        <AlertTriangle size={14} />
                        Face models did not load. The photo still works, ungated.
                      </p>
                    ) : !isLoaded ? (
                      <p className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Loader2 size={14} className="animate-spin" />
                        Loading face detection…
                      </p>
                    ) : (
                      <>
                        <StatusLine
                          ok={faceStatus === 'single'}
                          okText="One face in frame"
                          pendingText="No face detected"
                        />
                        {faceStatus === 'multiple' && (
                          <p className="flex items-center gap-2 text-sm text-[var(--error)]">
                            <Users size={14} />
                            More than one face — a candidate is blocked from capturing here.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {PROCTORING_CONFIG.noise.enabled && (
                  <div>
                    <p className="mb-1 text-sm font-medium text-[var(--textSecondary)]">
                      Background noise
                    </p>
                    <NoiseLevelMeter
                      band={noise.band}
                      level={noise.level}
                      measuring={noise.measuring}
                      blocksStart={PROCTORING_CONFIG.noise.blocksStart}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Identity capture, real shutter, no upload. The assessment id is a
          placeholder that is never sent anywhere — see `persist`. */}
      {!cameraError && (
        <Card>
          <CardHeader>
            <CardTitle>Identity capture</CardTitle>
          </CardHeader>
          <CardContent>
            <ExamIdentityCheck
              videoRef={videoRef}
              assessmentId={0}
              candidateEmail="test-mode@preview.local"
              persist={false}
              faceStatus={faceStatus}
              faceCheckEnabled={faceCheckEnabled && isLoaded}
              cameraReady={!!stream}
              onStatusChange={(status) => setPhotoTaken(status === 'saved')}
              onRoomScanChange={handleRoomScanChange}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLine({
  ok,
  okText,
  pendingText,
}: Readonly<{ ok: boolean; okText: string; pendingText: string }>) {
  return (
    <p
      className={`mt-1 flex items-center gap-2 text-sm ${
        ok ? 'text-[var(--success)]' : 'text-[var(--textSecondary)]'
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <UserRound size={14} />}
      {ok ? okText : pendingText}
    </p>
  );
}
