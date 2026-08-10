import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Shield,
  Camera,
  Mic,
  Maximize,
  AlertTriangle,
  CheckCircle,
  Monitor,
  Clock,
  Users,
  Volume2,
  ScanLine,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NoiseLevelMeter } from '@/components/exam/NoiseLevelMeter';
import {
  ExamIdentityCheck,
  type FaceStatus,
  type IdentityPhotoStatus,
} from '@/components/exam/ExamIdentityCheck';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useMicNoiseLevel } from '@/hooks/useMicNoiseLevel';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { ROUTES } from '@/config/routes';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';
import { computeExamMinutes, formatDurationLabel } from '@/utils/exam-duration.utils';
import type { Assessment } from '@/types/assessment.types';

/** Face checks on this screen run fast — the candidate is waiting on them. */
const CHECK_INTERVAL_MS = 1000;
/** Readings are only trusted after the detector has had two cycles to settle. */
const DETECTION_WARMUP_MS = CHECK_INTERVAL_MS * 2;
/**
 * How long to wait for the face models before giving up on them. Without this,
 * a slow CDN or a missing /models directory would leave the photo button
 * permanently disabled — the candidate would be locked out of their exam by an
 * infrastructure problem they cannot see or fix.
 */
const MODEL_LOAD_TIMEOUT_MS = 15000;

export function ExamInstructionsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const assessment = (location.state as { assessment?: Assessment })?.assessment;
  const photoConfig = PROCTORING_CONFIG.identityPhoto;
  const noiseConfig = PROCTORING_CONFIG.noise;
  const faceCheckEnabled = PROCTORING_CONFIG.eyeDetection.enabled;

  const [agreed, setAgreed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photoStatus, setPhotoStatus] = useState<IdentityPhotoStatus>('idle');
  // True unless a required room scan is still outstanding — the check component
  // reports this, since it owns the scan.
  const [roomScanOk, setRoomScanOk] = useState(!PROCTORING_CONFIG.roomScan.required);
  const [detectionWarm, setDetectionWarm] = useState(false);
  const [modelsTimedOut, setModelsTimedOut] = useState(false);

  /** Questions in this paper — drives the exam clock. Null while unknown. */
  const [questionCount, setQuestionCount] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { isLoaded, faceDetected, multipleFaces, loadModels, startDetection, stopDetection } =
    useFaceDetection({
      // This screen only reports what it sees; auto-submit belongs to the exam.
      maxWarnings: Number.POSITIVE_INFINITY,
      checkIntervalMs: CHECK_INTERVAL_MS,
      noFaceConsecutiveFrames: 1,
      multipleFacesConsecutiveFrames: 1,
    });

  const noise = useMicNoiseLevel(stream);

  // ── Exam length ───────────────────────────────────────────────────
  // The clock is per-question, so the paper has to be counted before we can
  // promise the candidate a duration. A failed count is not worth blocking the
  // screen for — computeExamMinutes falls back to the configured default.
  useEffect(() => {
    if (!assessment?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await assessmentService.fetchQuestions(assessment.id);
        const raw = res.data?.questions;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!cancelled && Array.isArray(parsed)) setQuestionCount(parsed.length);
      } catch {
        // Count stays unknown; the fallback duration is shown instead.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assessment?.id]);

  const durationMinutes = computeExamMinutes({
    type: assessment?.assessmentType,
    questionCount,
    minutesPerQuestion: assessment?.minutesPerQuestion,
    durationMinutes: assessment?.durationMinutes,
  });

  // ── Face detection ────────────────────────────────────────────────
  // Models are ~1 MB; fetching them while the candidate reads the rules means
  // the check is ready by the time they grant permission.
  useEffect(() => {
    if (faceCheckEnabled) void loadModels();
  }, [faceCheckEnabled, loadModels]);

  // If the models never arrive, the face gate is dropped rather than left
  // hanging — see MODEL_LOAD_TIMEOUT_MS.
  useEffect(() => {
    if (!faceCheckEnabled || isLoaded) return;
    const timer = window.setTimeout(() => setModelsTimedOut(true), MODEL_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [faceCheckEnabled, isLoaded]);

  /** Whether we can actually vouch for what the camera sees right now. */
  const faceCheckAvailable = faceCheckEnabled && (isLoaded || !modelsTimedOut);

  // Detection starts on the first moment both halves exist — the models and a
  // live preview — whichever of the two lands last.
  const detectionStartedRef = useRef(false);
  useEffect(() => {
    if (!faceCheckEnabled || !isLoaded || !cameraReady) return;
    const video = videoRef.current;
    if (!video || detectionStartedRef.current) return;

    detectionStartedRef.current = true;
    startDetection(video);
    const timer = window.setTimeout(() => setDetectionWarm(true), DETECTION_WARMUP_MS);
    return () => window.clearTimeout(timer);
  }, [faceCheckEnabled, isLoaded, cameraReady, startDetection]);

  useEffect(() => {
    return () => {
      stopDetection();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [stopDetection]);

  const requestPermissions = async () => {
    setPermissionLoading(true);
    try {
      const live = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = live;
      setStream(live);

      // Detection is started by the effect above, once the models are ready too.
      if (videoRef.current) videoRef.current.srcObject = live;

      setCameraReady(true);
      setMicReady(true);
      showToast(MESSAGES.examSetup.permissionsGranted, 'success');
    } catch {
      showToast(MESSAGES.examSetup.permissionsFailed, 'error');
    } finally {
      setPermissionLoading(false);
    }
  };

  // ── Derived check state ───────────────────────────────────────────
  let faceStatus: FaceStatus = 'unknown';
  if (faceCheckAvailable && cameraReady && detectionWarm) {
    if (multipleFaces) faceStatus = 'multiple';
    else if (!faceDetected) faceStatus = 'none';
    else faceStatus = 'single';
  }

  // Required means stored — a photo we never received is not a photo we have.
  const photoOk = !photoConfig.required || photoStatus === 'saved';

  const secondPersonBlocking = faceCheckAvailable && faceStatus === 'multiple';
  const noiseBlocking = noiseConfig.enabled && noiseConfig.blocksStart && noise.band === 'loud';

  // Every reason the button is disabled, spelled out. A dead button with no
  // explanation is the fastest way to make a candidate think the exam is broken.
  const blockers: string[] = [];
  if (!cameraReady || !micReady) blockers.push(MESSAGES.examSetup.enableDevicesRequired);
  if (!photoOk) {
    // Distinguish "you haven't taken it" from "we couldn't save the one you took".
    blockers.push(
      photoStatus === 'upload-failed'
        ? MESSAGES.examSetup.photoUploadFailed
        : MESSAGES.examSetup.photoRequired
    );
  }
  if (!roomScanOk) blockers.push(MESSAGES.examSetup.roomScanRequired);
  if (secondPersonBlocking) blockers.push(MESSAGES.examSetup.secondPersonPresent);
  if (noiseBlocking) blockers.push(MESSAGES.examSetup.tooNoisy);
  if (!agreed) blockers.push(MESSAGES.examSetup.agreeRequired);

  const canStart = blockers.length === 0;

  const handleStartExam = async () => {
    if (!canStart) {
      showToast(blockers[0], 'warning');
      return;
    }

    // Enter fullscreen here, inside the click gesture. The exam page's own init
    // runs async after navigation and has no user activation, so requestFullscreen
    // would be rejected there — fullscreen persists across the client-side nav.
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Denied/unsupported — the exam page shows a "Return to Fullscreen" prompt.
    }

    // Stop the preview stream before navigating; the exam page opens its own.
    stopDetection();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const route =
      assessment?.assessmentType === 'CODING'
        ? ROUTES.CANDIDATE.EXAM_CODING
        : ROUTES.CANDIDATE.EXAM_APTITUDE;

    // durationMinutes rides along so the exam clock matches the number the
    // candidate just agreed to, even if the paper reloads differently.
    navigate(route, { state: { assessment, durationMinutes, questionCount } });
  };

  const handlePhotoStatusChange = useCallback((next: IdentityPhotoStatus) => {
    setPhotoStatus(next);
  }, []);

  if (!assessment) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">
          No assessment data found. Please go back to assessments.
        </p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  const durationRule =
    questionCount && questionCount > 0
      ? `You have ${formatDurationLabel(durationMinutes)} for ${questionCount} question${questionCount === 1 ? '' : 's'}.`
      : `You have ${formatDurationLabel(durationMinutes)} to complete this exam.`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Exam Instructions</h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          {assessment.assessmentType} Assessment - {assessment.jobPrefix}
        </p>
      </div>

      {/* Rules */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--primary)]" />
              Rules and Guidelines
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              { icon: <Clock size={18} />, text: durationRule },
              {
                icon: <Camera size={18} />,
                // Only promise the photo where it is actually taken.
                text: photoConfig.required
                  ? 'We take one photo of you before the exam to confirm your identity. Your camera then stays on throughout.'
                  : 'Your camera must remain on throughout the exam. Face detection is active.',
              },
              {
                icon: <Users size={18} />,
                text: 'You must be alone. If a second person appears on camera, it is recorded as a violation.',
              },
              // Only promised to the candidate where it is actually asked for.
              ...(PROCTORING_CONFIG.roomScan.required
                ? [
                    {
                      icon: <ScanLine size={18} />,
                      text: 'You will be asked to scan your room with your camera before the exam begins.',
                    },
                  ]
                : []),
              {
                icon: <Volume2 size={18} />,
                text: 'Sit somewhere quiet. The noise check below must be out of the red before you can start.',
              },
              {
                icon: <Mic size={18} />,
                text: 'Your microphone must remain enabled during the exam.',
              },
              {
                icon: <Maximize size={18} />,
                text: 'The exam will run in fullscreen mode. Exiting fullscreen is not allowed.',
              },
              {
                icon: <Monitor size={18} />,
                text: 'Switching tabs or windows will trigger a warning. Repeated switches auto-submit your exam.',
              },
              {
                icon: <AlertTriangle size={18} />,
                text: 'If your face is repeatedly not detected, the exam will be auto-submitted.',
              },
              {
                icon: <Shield size={18} />,
                text: 'Do not use any external resources, notes, or assistance during the exam.',
              },
              {
                icon: <Shield size={18} />,
                text: 'Ensure a stable internet connection before starting.',
              },
            ].map((rule) => (
              <li key={rule.text} className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5 text-[var(--primary)]">{rule.icon}</span>
                <span className="text-[var(--text)]">{rule.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* System check: devices, identity photo, room noise */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-[var(--primary)]" />
              System Check
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Live preview */}
            <div className="space-y-4">
              <div className="aspect-video bg-[var(--surface2)] rounded-lg overflow-hidden border border-[var(--border)]">
                {/* Kept mounted so the ref exists the moment permission lands. */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${cameraReady ? '' : 'hidden'}`}
                />
                {!cameraReady && (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--textTertiary)]">
                    <Camera className="w-10 h-10 mb-2" />
                    <p className="text-sm">Camera preview will appear here</p>
                  </div>
                )}
              </div>

              {noiseConfig.enabled && (
                <NoiseLevelMeter
                  band={noise.band}
                  level={noise.level}
                  measuring={micReady && noise.measuring}
                  blocksStart={noiseConfig.blocksStart}
                />
              )}
            </div>

            {/* Device status */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {cameraReady ? (
                  <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                )}
                <span className="text-[var(--text)]">
                  Camera: {cameraReady ? 'Ready' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {micReady ? (
                  <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                )}
                <span className="text-[var(--text)]">
                  Microphone: {micReady ? 'Ready' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Maximize className="w-5 h-5 text-[var(--info,var(--primary))]" />
                <span className="text-[var(--text)]">
                  Fullscreen will be activated on exam start
                </span>
              </div>

              <Button
                variant="outline"
                onClick={requestPermissions}
                isLoading={permissionLoading}
                disabled={cameraReady && micReady}
                leftIcon={<Camera size={18} />}
                className="w-full"
              >
                {cameraReady && micReady ? 'Permissions Granted' : 'Enable Camera & Microphone'}
              </Button>
            </div>
          </div>

          {/* Identity photo + optional room scan */}
          <div className="mt-6 pt-6 border-t border-[var(--border)]">
            <ExamIdentityCheck
              videoRef={videoRef}
              assessmentId={assessment.id}
              candidateEmail={user?.email ?? assessment.candidateEmail}
              faceStatus={faceStatus}
              faceCheckEnabled={faceCheckAvailable}
              cameraReady={cameraReady}
              onStatusChange={handlePhotoStatusChange}
              onRoomScanChange={setRoomScanOk}
            />
          </div>
        </CardContent>
      </Card>

      {/* Agreement and Start */}
      <Card>
        <CardContent>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-[var(--text)]">
                I have read and understood all the instructions above. I agree to follow the rules
                and understand that violations may result in automatic submission of my exam.
              </span>
            </label>

            {blockers.length > 0 && (
              <ul className="space-y-1.5 rounded-lg bg-[var(--surface1)] p-3">
                {blockers.map((blocker) => (
                  <li
                    key={blocker}
                    className="flex items-start gap-2 text-sm text-[var(--textSecondary)]"
                  >
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
                    {blocker}
                  </li>
                ))}
              </ul>
            )}

            <Button size="lg" className="w-full" onClick={handleStartExam} disabled={!canStart}>
              Start Exam
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
