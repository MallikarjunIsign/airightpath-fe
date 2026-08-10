import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  ScanLine,
  Loader2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { examProctoringService } from '@/services/exam-proctoring.service';
import { captureVideoFrame } from '@/utils/media.utils';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';

/**
 * The identity step of the pre-exam check: one photo of the candidate, taken
 * from the live preview and stored against the assessment, plus an optional
 * sweep of the room.
 *
 * Two rules are enforced here rather than left to the exam itself, because a
 * problem found now costs the candidate ten seconds and a problem found later
 * costs them the exam: a face must actually be in frame when the shutter fires,
 * and a second person in frame blocks the capture outright.
 */

/** What the live face detector currently sees in the preview. */
export type FaceStatus = 'unknown' | 'none' | 'single' | 'multiple';

export type IdentityPhotoStatus =
  | 'idle'
  | 'countdown'
  | 'capturing'
  | 'uploading'
  | 'saved'
  /** Photo taken, backend rejected it — retryable, and blocks the exam start. */
  | 'upload-failed';

type RoomScanStatus = 'idle' | 'scanning' | 'uploading' | 'done' | 'failed';

interface ExamIdentityCheckProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  assessmentId: number;
  candidateEmail: string;
  faceStatus: FaceStatus;
  /**
   * False when face detection is switched off for the environment. The photo is
   * still taken; it simply is not gated on what the detector can see.
   */
  faceCheckEnabled: boolean;
  /** False until the camera is live — every action stays disabled before that. */
  cameraReady: boolean;
  onStatusChange: (status: IdentityPhotoStatus) => void;
  /**
   * Reports whether the room scan requirement is met. Always true when the scan
   * is not required, so the caller can gate on it unconditionally.
   */
  onRoomScanChange: (satisfied: boolean) => void;
}

const COUNTDOWN_SECONDS = 3;

export function ExamIdentityCheck({
  videoRef,
  assessmentId,
  candidateEmail,
  faceStatus,
  faceCheckEnabled,
  cameraReady,
  onStatusChange,
  onRoomScanChange,
}: Readonly<ExamIdentityCheckProps>) {
  const { showToast } = useToast();
  const photoConfig = PROCTORING_CONFIG.identityPhoto;
  const scanConfig = PROCTORING_CONFIG.roomScan;

  const [status, setStatus] = useState<IdentityPhotoStatus>('idle');
  const [countdown, setCountdown] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [scanStatus, setScanStatus] = useState<RoomScanStatus>('idle');
  const [scanFrameUrls, setScanFrameUrls] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState(0);

  const countdownTimerRef = useRef<number | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanFramesRef = useRef<Blob[]>([]);
  // The last captured shot, kept so a failed upload can be retried as-is.
  const photoBlobRef = useRef<Blob | null>(null);
  // Object URLs are revoked by hand; the browser holds the blob alive otherwise.
  const objectUrlsRef = useRef<string[]>([]);

  const trackUrl = useCallback((url: string) => {
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  // Required means stored, not merely performed — same rule as the photo. A scan
  // sitting in a browser tab is not evidence of anything, so a failed upload is
  // retried (the frames are kept) rather than waved through.
  const roomScanSatisfied = !scanConfig.required || scanStatus === 'done';

  useEffect(() => {
    onRoomScanChange(roomScanSatisfied);
  }, [roomScanSatisfied, onRoomScanChange]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  // ── Identity photo ─────────────────────────────────────────────────
  const uploadPhoto = useCallback(
    async (blob: Blob) => {
      setStatus('uploading');
      try {
        await examProctoringService.uploadIdentityPhoto({ assessmentId, candidateEmail, blob });
        setStatus('saved');
        showToast(MESSAGES.examSetup.photoCaptured, 'success');
      } catch {
        // A photo we failed to store proves nothing about who sat the exam, so
        // this is not waved through — the candidate gets a retry that reuses the
        // shot they already took, rather than being sent round the loop again.
        setStatus('upload-failed');
      }
    },
    [assessmentId, candidateEmail, showToast]
  );

  const takePhoto = useCallback(async () => {
    setStatus('capturing');

    const blob = await captureVideoFrame(videoRef.current, { maxWidth: photoConfig.maxWidth });
    if (!blob) {
      setStatus('idle');
      showToast(MESSAGES.examSetup.photoNoFace, 'warning');
      return;
    }

    photoBlobRef.current = blob;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(trackUrl(URL.createObjectURL(blob)));

    await uploadPhoto(blob);
  }, [photoConfig.maxWidth, photoUrl, showToast, trackUrl, uploadPhoto, videoRef]);

  const retryPhotoUpload = useCallback(() => {
    const blob = photoBlobRef.current;
    if (blob) void uploadPhoto(blob);
  }, [uploadPhoto]);

  const startCapture = useCallback(() => {
    if (!cameraReady) return;
    // Only gate on what the detector sees when the detector is actually running.
    if (faceCheckEnabled) {
      if (faceStatus === 'multiple') {
        showToast(MESSAGES.examSetup.photoMultipleFaces, 'error');
        return;
      }
      if (faceStatus !== 'single') {
        showToast(MESSAGES.examSetup.photoNoFace, 'warning');
        return;
      }
    }

    setStatus('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          void takePhoto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cameraReady, faceCheckEnabled, faceStatus, showToast, takePhoto]);

  // ── Optional 360° room scan ────────────────────────────────────────
  const finishScan = useCallback(async () => {
    const frames = scanFramesRef.current;
    if (frames.length === 0) {
      setScanStatus('failed');
      return;
    }

    setScanStatus('uploading');
    try {
      await examProctoringService.uploadRoomScan({ assessmentId, candidateEmail, frames });
      setScanStatus('done');
      showToast(MESSAGES.examSetup.roomScanDone, 'success');
    } catch {
      setScanStatus('failed');
      showToast(MESSAGES.examSetup.roomScanFailed, 'warning');
    }
  }, [assessmentId, candidateEmail, showToast]);

  const startRoomScan = useCallback(() => {
    scanFramesRef.current = [];
    setScanFrameUrls([]);
    setScanProgress(0);
    setScanStatus('scanning');

    const intervalMs = Math.max(600, Math.round(scanConfig.durationMs / scanConfig.frames));
    let captured = 0;

    scanTimerRef.current = window.setInterval(() => {
      void (async () => {
        const blob = await captureVideoFrame(videoRef.current, { maxWidth: photoConfig.maxWidth });
        if (blob) {
          scanFramesRef.current.push(blob);
          setScanFrameUrls((prev) => [...prev, trackUrl(URL.createObjectURL(blob))]);
        }

        captured += 1;
        setScanProgress(Math.round((captured / scanConfig.frames) * 100));

        if (captured >= scanConfig.frames) {
          if (scanTimerRef.current) clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
          void finishScan();
        }
      })();
    }, intervalMs);
  }, [finishScan, photoConfig.maxWidth, scanConfig.durationMs, scanConfig.frames, trackUrl, videoRef]);

  const cancelRoomScan = useCallback(() => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    scanFramesRef.current = [];
    setScanFrameUrls([]);
    setScanProgress(0);
    setScanStatus('idle');
  }, []);

  // Nothing to ask for — neither step is switched on for this environment.
  if (!photoConfig.required && !scanConfig.required) return null;

  const busy = status === 'countdown' || status === 'capturing' || status === 'uploading';
  const hasPhoto = status === 'saved' || status === 'upload-failed';
  // The scan follows the photo when both are asked for, so the candidate does
  // one thing at a time; with the photo off it stands alone.
  const showRoomScan = scanConfig.required && (!photoConfig.required || hasPhoto);
  const blockedBySecondPerson = faceCheckEnabled && faceStatus === 'multiple';

  // The Button renders its own spinner while uploading, so it takes no icon then.
  const captureIcon = hasPhoto ? <RefreshCw size={14} /> : <Camera size={14} />;

  return (
    <div className="space-y-4">
      {/* ── Live face read-out ──────────────────────────────────────── */}
      {faceCheckEnabled && <FaceStatusRow faceStatus={faceStatus} cameraReady={cameraReady} />}

      {/* ── Photo (only rendered when required — see identityPhoto config) ── */}
      {photoConfig.required && (
        <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Camera size={16} className="text-[var(--primary)]" />
                Your photo
                <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--error)]">
                  Required
                </span>
              </h3>
              <p className="mt-1 text-xs text-[var(--textSecondary)]">
                We take one photo to confirm it is you sitting the exam. Face the camera in good
                light, with nobody else in the frame.
              </p>
            </div>

            {photoUrl && (
              <img
                src={photoUrl}
                alt="You, as captured for identity verification"
                className="h-16 w-16 rounded-lg object-cover border border-[var(--border)] flex-shrink-0"
              />
            )}
          </div>

          {status === 'countdown' && (
            <p className="text-sm font-semibold text-[var(--primary)]">
              Hold still — capturing in {countdown}…
            </p>
          )}

          {status === 'saved' && (
            <p className="flex items-center gap-2 text-sm text-[var(--success)]">
              <CheckCircle2 size={16} />
              Photo saved.
            </p>
          )}

          {status === 'upload-failed' && (
            <p className="flex items-center gap-2 text-sm text-[var(--error)]">
              <AlertTriangle size={16} />
              {MESSAGES.examSetup.photoUploadFailed}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Retry sends the shot already taken — no need to pose again. */}
            {status === 'upload-failed' && (
              <Button size="sm" onClick={retryPhotoUpload} leftIcon={<RefreshCw size={14} />}>
                Try saving again
              </Button>
            )}
            <Button
              size="sm"
              variant={hasPhoto ? 'outline' : 'primary'}
              onClick={startCapture}
              disabled={!cameraReady || busy || blockedBySecondPerson}
              isLoading={status === 'uploading'}
              leftIcon={status === 'uploading' ? undefined : captureIcon}
            >
              {hasPhoto ? 'Retake photo' : 'Take photo'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Room scan (only rendered when required — see roomScan config) ── */}
      {showRoomScan && (
        <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <ScanLine size={16} className="text-[var(--primary)]" />
              Room scan
              <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--error)]">
                Required
              </span>
            </h3>
            <p className="mt-1 text-xs text-[var(--textSecondary)]">
              Slowly turn your laptop or webcam in a full circle so we can see the room around you.
              It takes about {Math.round(scanConfig.durationMs / 1000)} seconds.
            </p>
          </div>

          {scanStatus === 'scanning' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--primary)]">
                Keep turning slowly… {scanProgress}%
              </p>
              <div className="h-2 w-full rounded-full bg-[var(--surface2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 ease-out"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {scanStatus === 'uploading' && (
            <p className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
              <Loader2 size={16} className="animate-spin" />
              Saving your room scan…
            </p>
          )}

          {scanStatus === 'done' && (
            <p className="flex items-center gap-2 text-sm text-[var(--success)]">
              <CheckCircle2 size={16} />
              Room scan saved.
            </p>
          )}

          {scanStatus === 'failed' && (
            <p className="flex items-center gap-2 text-sm text-[var(--error)]">
              <AlertTriangle size={16} />
              {MESSAGES.examSetup.roomScanFailed}
            </p>
          )}

          {scanFrameUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {scanFrameUrls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`Room scan frame ${i + 1}`}
                  className="h-12 w-16 rounded-md object-cover border border-[var(--border)] flex-shrink-0"
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {scanStatus === 'scanning' ? (
              <Button size="sm" variant="outline" onClick={cancelRoomScan}>
                Cancel scan
              </Button>
            ) : (
              <>
                {/* Retry reuses the frames already captured — no second sweep. */}
                {scanStatus === 'failed' && (
                  <Button size="sm" onClick={finishScan} leftIcon={<RefreshCw size={14} />}>
                    Try saving again
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={roomScanSatisfied || scanStatus === 'failed' ? 'outline' : 'primary'}
                  onClick={startRoomScan}
                  disabled={!cameraReady || scanStatus === 'uploading'}
                  leftIcon={<ScanLine size={14} />}
                >
                  {scanStatus === 'idle' ? 'Start room scan' : 'Scan again'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One line telling the candidate exactly what the camera can see right now. */
function FaceStatusRow({
  faceStatus,
  cameraReady,
}: Readonly<{ faceStatus: FaceStatus; cameraReady: boolean }>) {
  if (!cameraReady) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--textTertiary)]">
        <UserRound size={16} />
        Face check starts once your camera is on.
      </p>
    );
  }

  const states: Record<FaceStatus, { icon: typeof UserRound; text: string; tone: string }> = {
    unknown: {
      icon: Loader2,
      text: 'Looking for your face…',
      tone: 'text-[var(--textSecondary)]',
    },
    none: {
      icon: AlertTriangle,
      text: 'No face detected — please centre yourself in the frame.',
      tone: 'text-[var(--warning)]',
    },
    single: {
      icon: CheckCircle2,
      text: 'Face detected. You are alone in frame.',
      tone: 'text-[var(--success)]',
    },
    multiple: {
      icon: Users,
      text: MESSAGES.examSetup.secondPersonPresent,
      tone: 'text-[var(--error)]',
    },
  };

  const { icon: Icon, text, tone } = states[faceStatus];
  return (
    <p className={`flex items-center gap-2 text-sm ${tone}`}>
      <Icon size={16} className={faceStatus === 'unknown' ? 'animate-spin' : ''} />
      {text}
    </p>
  );
}
