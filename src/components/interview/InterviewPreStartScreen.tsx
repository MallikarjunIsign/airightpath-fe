import { QRCodeSVG } from 'qrcode.react';
import {
  Video,
  Monitor,
  CheckCircle2,
  Volume2,
  VolumeX,
  Timer,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  Smartphone,
  ScanLine,
  Mic,
  Camera,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DeviceCheckPreview } from '@/components/testmode/DeviceCheckPreview';
import { APP_CONFIG } from '@/config/app.config';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';

/** Status icon for a device/permission check (granted / denied / checking / pending). */
function PermissionIcon({ status }: Readonly<{ status: string }>) {
  if (status === 'granted') return <CheckCircle size={16} className="text-emerald-500" />;
  if (status === 'denied') return <XCircle size={16} className="text-red-500" />;
  if (status === 'checking') return <Loader2 size={16} className="animate-spin text-gray-400" />;
  return <Circle size={16} className="text-amber-500" />;
}

/**
 * One numbered step.
 *
 * The steps are numbered because the order is real — the rules have to be read
 * before the identity photo means anything, and the phone is positioned last so
 * it can be aimed at a screen that is already showing the interview. Numbering
 * something that is not a sequence would be decoration; this is a sequence.
 */
function Step({
  index,
  title,
  subtitle,
  status,
  children,
}: Readonly<{
  index: number;
  title: string;
  subtitle?: string;
  status: 'pending' | 'active' | 'done';
  children: React.ReactNode;
}>) {
  let badge = 'bg-[var(--surface2)] text-[var(--textSecondary)]';
  if (status === 'active') badge = 'bg-[var(--primary)] text-white';
  else if (status === 'done') badge = 'bg-emerald-500 text-white';

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface1)] p-5 text-left space-y-4">
      <header className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}
        >
          {status === 'done' ? <CheckCircle2 size={14} /> : index}
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-[var(--text)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--textSecondary)]">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** What the capture step is called, given which captures are switched on. */
function captureStepTitle(photoRequired: boolean, roomScanRequired: boolean): string {
  if (photoRequired && roomScanRequired) return 'Photo and room scan';
  return photoRequired ? 'Photo' : 'Room scan';
}

/** Why Start is closed while a capture is outstanding. Names only what is asked for. */
function captureBlockedReason(photoRequired: boolean, roomScanRequired: boolean): string {
  if (photoRequired && roomScanRequired) {
    return 'Take your photo and complete the room scan in step 2.';
  }
  return photoRequired
    ? 'Take your photo in step 2.'
    : 'Complete the room scan in step 2.';
}

interface InterviewPreStartScreenProps {
  jobPrefix: string;
  isSetupActive: boolean;
  mobileConnected: boolean;
  mobileVerified: boolean;
  /** QR value: the mobile-connect URL with token. */
  mobileConnectUrl: string;
  isSpeaking: boolean;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  isCountdownActive: boolean;
  instructionCountdown: number;
  micPermission: string;
  cameraPermission: string;
  error?: string;
  starting: boolean;
  canStartInterview: boolean;
  onStart: () => void;
  /** The interview these captures belong to. */
  scheduleId: number;
  candidateEmail: string;
  /** True once the identity photo and room sweep are both done. */
  capturesReady: boolean;
  /** When true the phone must be paired before the interview can begin. */
  mobileRequired: boolean;
  onCapturesReadyChange: (ready: boolean) => void;
}

/**
 * Everything a candidate does before the interview starts, as explicit steps:
 * read the rules, prove who you are and what room you are in, then position a
 * phone as a second camera.
 *
 * Modelled on the exam instructions screen, because the two should not feel like
 * different products — and because the identity photo and room sweep are the
 * same evidence there, collected the same way.
 */
export function InterviewPreStartScreen({
  jobPrefix,
  isSetupActive,
  mobileConnected,
  mobileVerified,
  mobileConnectUrl,
  isSpeaking,
  isAudioMuted,
  onToggleAudio,
  isCountdownActive,
  instructionCountdown,
  micPermission,
  cameraPermission,
  error,
  starting,
  canStartInterview,
  onStart,
  scheduleId,
  candidateEmail,
  capturesReady,
  mobileRequired,
  onCapturesReadyChange,
}: Readonly<InterviewPreStartScreenProps>) {
  /**
   * Proctoring switches, read from the same VITE_PROCTORING_* values the
   * assessment reads.
   *
   * The interview used to require the camera and both captures outright while
   * the exam honoured the environment, so the two flows disagreed about the
   * same candidate on the same machine. One source of truth means an
   * administrator changing a switch changes both.
   */
  const cameraRequired = PROCTORING_CONFIG.camera.required;
  const photoRequired = PROCTORING_CONFIG.identityPhoto.required;
  const roomScanRequired = PROCTORING_CONFIG.roomScan.required;
  const capturesNeeded = photoRequired || roomScanRequired;

  // The steps renumber when one is switched off — a visible 1, 3 reads as a
  // rendering fault rather than a configuration choice.
  const phoneStepIndex = capturesNeeded ? 3 : 2;
  const devicesReady = micPermission === 'granted' && cameraPermission === 'granted';
  const rulesRead = !isCountdownActive;

  /**
   * The start button's gate, and the reason it is closed.
   *
   * Stated rather than left to a disabled button: a candidate who cannot start
   * and is not told why assumes the page is broken and reloads, which is the one
   * thing the rules tell them not to do.
   */
  let blockedReason: string | null = null;
  if (micPermission === 'denied') {
    blockedReason = 'Microphone access is blocked. Enable it in your browser settings, then reload.';
  } else if (cameraRequired && cameraPermission === 'denied') {
    blockedReason = 'Camera access is blocked. Enable it in your browser settings, then reload.';
  } else if (!rulesRead) {
    blockedReason = 'Finish reading the rules — the timer above has to reach zero.';
  } else if (capturesNeeded && !capturesReady) {
    // Only a gate while at least one capture is switched on. Waiting on a step
    // that is configured off would leave Start permanently disabled.
    blockedReason = captureBlockedReason(photoRequired, roomScanRequired);
  } else if (mobileRequired && isSetupActive && !mobileVerified) {
    blockedReason = 'Scan the QR code with your phone and keep that page open — this interview requires it.';
  } else if (mobileVerified && !canStartInterview) {
    blockedReason = 'Finishing the phone check…';
  }

  const canStart = blockedReason === null;

  let startLabel = 'Begin AI Interview';
  if (!canStart) startLabel = 'Complete the steps above';
  // Only offered where a phone is optional; promising it otherwise would be a
  // button that refuses to do what it says.
  else if (isSetupActive && !mobileVerified && !mobileRequired) startLabel = 'Begin without a phone';

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
            <Video className="h-10 w-10 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)]">AI Voice Interview</h1>
          <p className="text-[var(--textSecondary)]">
            A real-time voice interview for{' '}
            <strong className="text-[var(--text)]">{jobPrefix}</strong>, lasting up to{' '}
            {APP_CONFIG.INTERVIEW_TIMER_MINUTES} minutes. Work through the steps below — the start
            button turns on when they are done.
          </p>

          {/* Audio narration */}
          <div className="flex items-center justify-center gap-3">
            {isSpeaking && !isAudioMuted && (
              <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 dark:border-blue-800 dark:bg-blue-900/20">
                <Volume2 size={14} className="animate-pulse text-blue-500" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  Reading instructions...
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleAudio}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isAudioMuted
                  ? 'bg-[var(--surface1)] text-[var(--textSecondary)] hover:bg-[var(--surface2)]'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30'
              }`}
              title={isAudioMuted ? 'Audio narration muted' : 'Mute audio narration'}
            >
              {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isAudioMuted ? 'Muted' : 'Audio On'}
            </button>
          </div>
        </div>

        {/* ── Step 1: the rules ─────────────────────────────────────── */}
        <Step
          index={1}
          title="Read the rules"
          subtitle="How the interview runs, and what counts as a warning."
          status={rulesRead ? 'done' : 'active'}
        >
          {isCountdownActive && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-2">
                <Timer size={18} className="text-[var(--primary)]" />
                <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text)]">
                  {String(Math.floor(instructionCountdown / 60)).padStart(2, '0')}:
                  {String(instructionCountdown % 60).padStart(2, '0')}
                </span>
              </div>
              <p className="text-xs text-[var(--textSecondary)]">
                The start button unlocks when this reaches zero.
              </p>
            </div>
          )}

          <ul className="space-y-2 text-sm text-[var(--text)]">
            <li className="flex items-start gap-2">
              <Mic size={14} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
              You speak with an AI interviewer. Click the mic to answer, and stop when you are done.
            </li>
            <li className="flex items-start gap-2">
              <Video size={14} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
              Your answers are transcribed live, and your camera and screen are recorded throughout.
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
              Do not reload this page once the interview begins. It cannot be resumed from where you
              left off.
            </li>
          </ul>

          {/* Permissions */}
          <div className="space-y-2 rounded-lg bg-[var(--surface2)] p-4">
            <p className="text-sm font-semibold text-[var(--text)]">Permission check</p>
            <div className="flex items-center gap-2">
              <PermissionIcon status={micPermission} />
              <span className="text-sm text-[var(--text)]">Microphone</span>
              {micPermission === 'denied' && (
                <span className="ml-auto text-xs text-red-500">Enable in browser settings</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PermissionIcon status={cameraPermission} />
              <span className="text-sm text-[var(--text)]">Camera</span>
              {cameraPermission === 'denied' && (
                <span className="ml-auto text-xs text-red-500">Enable in browser settings</span>
              )}
            </div>
          </div>

          {/* Proctoring rules */}
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="mb-1 flex items-center gap-2">
              <Shield size={16} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Proctoring rules
              </p>
            </div>
            {/* Only the rules that are actually switched on. Warning someone
                about a check that is disabled is as misleading as staying quiet
                about one that is not — the exam instructions read the same
                switches for the same reason. */}
            <ul className="space-y-1.5 text-sm text-amber-700 dark:text-amber-300">
              {PROCTORING_CONFIG.tabSwitch.enabled && (
                <li>Switching tabs or windows is counted as a warning.</li>
              )}
              {PROCTORING_CONFIG.eyeDetection.enabled && (
                <li>A second face in frame, or no face at all, is a warning.</li>
              )}
              {PROCTORING_CONFIG.fullscreen.enabled && (
                <li>Leaving fullscreen or opening developer tools is a warning.</li>
              )}
              {roomScanRequired && (
                <li>You will be asked to scan your room with your camera before you begin.</li>
              )}
              <li>
                {APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS} warnings ends the interview
                automatically.
              </li>
            </ul>
          </div>
        </Step>

        {/* ── Step 2: identity and room ───────────────────────────────
            Hidden outright when both captures are switched off, rather than
            shown as an empty step the candidate cannot complete. */}
        {capturesNeeded && (
        <Step
          index={2}
          title={captureStepTitle(photoRequired, roomScanRequired)}
          subtitle="This is how we confirm who sat the interview and what was around you."
          status={capturesReady ? 'done' : 'active'}
        >
          <div className="flex items-start gap-2 rounded-lg bg-[var(--surface2)] p-3 text-sm text-[var(--textSecondary)]">
            <ScanLine size={16} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
            <p>
              Look straight at the camera for the photo, with nobody else in frame. Then turn slowly
              on the spot for the room scan so the whole room is captured — it takes a few seconds,
              so keep turning until it finishes.
            </p>
          </div>

          {devicesReady ? (
            <DeviceCheckPreview
              // `persist` marks this as the real check rather than a rehearsal:
              // the captures become stored evidence, and the VITE_PROCTORING_*
              // switches decide which of them are asked for.
              persist
              target={{ kind: 'interview', scheduleId }}
              candidateEmail={candidateEmail}
              onReadyChange={onCapturesReadyChange}
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Allow camera and microphone access first — this step needs both.
            </p>
          )}
        </Step>
        )}

        {/* ── Step 3: the phone ─────────────────────────────────────── */}
        {isSetupActive && (
          <Step
            index={phoneStepIndex}
            title="Connect your phone"
            subtitle="A second camera, showing you and your screen together."
            status={mobileVerified ? 'done' : 'active'}
          >
            {!mobileConnected ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-4 shadow-inner">
                    <QRCodeSVG value={mobileConnectUrl} size={200} />
                  </div>
                  <p className="text-sm font-medium text-[var(--text)]">
                    Scan this with your phone camera
                  </p>
                </div>

                {/* Positioning matters more than the scan, and is the part people
                    get wrong — hence spelling out the placement rather than one
                    line of hint text. */}
                <div className="space-y-2 rounded-lg bg-[var(--surface2)] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <Smartphone size={15} />
                    Where to put the phone
                  </p>
                  <ul className="space-y-1.5 text-sm text-[var(--textSecondary)]">
                    <li>
                      Stand it to one side of your desk, about an arm&rsquo;s length away, in
                      landscape.
                    </li>
                    <li>
                      Angle it so the camera sees <strong className="text-[var(--text)]">both
                      you and your screen</strong> in the same shot — that is the whole point of the
                      second camera.
                    </li>
                    <li>Keep it plugged in, and do not let it lock or sleep.</li>
                    <li>Leave the browser tab open on the phone for the whole interview.</li>
                  </ul>
                </div>

                <p className="flex items-start gap-2 text-xs text-[var(--textTertiary)]">
                  <Lock size={12} className="mt-0.5 flex-shrink-0" />
                  The phone feed is used for proctoring this interview only.
                </p>
              </div>
            ) : !mobileVerified ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Monitor className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Phone connected
                </p>
                <p className="text-center text-xs text-[var(--textSecondary)]">
                  Finish the room check on your phone. Keep it where it can see you and your screen.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Phone verified
                </p>
                <p className="text-xs text-[var(--textSecondary)]">Leave it exactly where it is.</p>
              </div>
            )}
          </Step>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Start */}
        <div className="space-y-2 text-center">
          <Button
            size="lg"
            onClick={onStart}
            isLoading={starting}
            disabled={!canStart}
            className={canStart ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            {startLabel}
          </Button>
          {blockedReason && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-[var(--textSecondary)]">
              <Camera size={13} className="flex-shrink-0" />
              {blockedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
