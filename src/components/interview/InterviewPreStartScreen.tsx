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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { APP_CONFIG } from '@/config/app.config';

/** Status icon for a device/permission check (granted / denied / checking / pending). */
function PermissionIcon({ status }: Readonly<{ status: string }>) {
  if (status === 'granted') return <CheckCircle size={16} className="text-emerald-500" />;
  if (status === 'denied') return <XCircle size={16} className="text-red-500" />;
  if (status === 'checking') return <Loader2 size={16} className="animate-spin text-gray-400" />;
  return <Circle size={16} className="text-amber-500" />;
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
}

/** Pre-start screen for the AI voice interview: mobile QR setup, permission & proctoring checks, start. */
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
}: Readonly<InterviewPreStartScreenProps>) {
  let startLabel: string;
  if (micPermission === 'denied') startLabel = 'Microphone Permission Required';
  else if (!isSetupActive) startLabel = 'Start Interview';
  else if (!mobileVerified) startLabel = 'Skip & Begin AI Interview';
  else startLabel = 'Begin AI Interview';

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Video className="w-10 h-10 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 className="text-3xl font-bold text-[var(--text)]">AI Voice Interview</h1>
        <p className="text-[var(--textSecondary)]">
          You are about to start a real-time voice interview for{' '}
          <strong className="text-[var(--text)]">{jobPrefix}</strong>. The interview
          will last up to {APP_CONFIG.INTERVIEW_TIMER_MINUTES} minutes.
        </p>

        {/* Setup Section */}
        {isSetupActive && (
          <div className="space-y-4 p-6 rounded-2xl bg-[var(--surface1)] border border-[var(--border)] shadow-sm animate-fade-in">
            <h2 className="text-lg font-bold text-[var(--text)]">Step 2: Mobile Connectivity</h2>

            {!mobileConnected ? (
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-white rounded-xl shadow-inner">
                  <QRCodeSVG value={mobileConnectUrl} size={200} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text)]">Scan to connect your phone</p>
                  <p className="text-xs text-[var(--textSecondary)]">Position the phone to see both you and the screen</p>
                </div>
              </div>
            ) : !mobileVerified ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Monitor className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text)] text-blue-600 dark:text-blue-400">Mobile Connected!</p>
                  <p className="text-xs text-[var(--textSecondary)]">Please complete room verification on your phone</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Verification Complete</p>
                  <p className="text-xs text-[var(--textSecondary)]">You are ready to start the interview</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio narration controls */}
        <div className="flex items-center justify-center gap-3">
          {isSpeaking && !isAudioMuted && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Volume2 size={14} className="text-blue-500 animate-pulse" />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Reading instructions...</span>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleAudio}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isAudioMuted
              ? 'bg-[var(--surface1)] text-[var(--textSecondary)] hover:bg-[var(--surface2)]'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
              }`}
            title={isAudioMuted ? 'Audio narration muted' : 'Mute audio narration'}
          >
            {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {isAudioMuted ? 'Muted' : 'Audio On'}
          </button>
        </div>

        {/* Countdown timer */}
        {isCountdownActive && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface1)] border border-[var(--border)]">
              <Timer size={18} className="text-[var(--primary)]" />
              <span className="text-2xl font-mono font-bold text-[var(--text)]">
                {String(Math.floor(instructionCountdown / 60)).padStart(2, '0')}:{String(instructionCountdown % 60).padStart(2, '0')}
              </span>
            </div>
            <p className="text-xs text-[var(--textSecondary)]">
              Please read the instructions below. The start button will be enabled when the timer reaches zero.
            </p>
          </div>
        )}

        {/* Permission checks */}
        <div className="space-y-2 text-left p-4 rounded-lg bg-[var(--surface1)]">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">Permission Check</p>
          <div className="flex items-center gap-2">
            <PermissionIcon status={micPermission} />
            <span className="text-sm text-[var(--text)]">Microphone</span>
            {micPermission === 'denied' && <span className="text-xs text-red-500 ml-auto">Please enable in browser settings</span>}
          </div>
          <div className="flex items-center gap-2">
            <PermissionIcon status={cameraPermission} />
            <span className="text-sm text-[var(--text)]">Camera</span>
            {cameraPermission === 'denied' && <span className="text-xs text-red-500 ml-auto">Please enable in browser settings</span>}
          </div>
        </div>

        {/* Proctoring rules */}
        <div className="space-y-2 text-left p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Proctoring Rules</p>
          </div>
          <ul className="space-y-1.5 text-sm text-amber-700 dark:text-amber-300">
            <li className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5" />Tab switching detected → warning</li>
            <li className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5" />Multiple faces or no face → warning</li>
            <li className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5" />Exiting fullscreen / DevTools → warning</li>
            <li className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5" />Maximum {APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS} warnings → termination</li>
          </ul>
        </div>

        <div className="space-y-2 text-left p-4 rounded-lg bg-[var(--surface1)]">
          <p className="text-sm text-[var(--text)]">- Voice conversation with AI interviewer</p>
          <p className="text-sm text-[var(--text)]">- Click mic to speak, stop when done</p>
          <p className="text-sm text-[var(--text)]">- Speech transcribed in real-time</p>
          <p className="text-sm text-[var(--text)]">- Video recorded for proctoring</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <Button
          size="lg"
          onClick={onStart}
          isLoading={starting}
          disabled={micPermission === 'denied' || (mobileVerified && !canStartInterview)}
          className={(mobileVerified || isSetupActive) ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          {startLabel}
        </Button>
      </div>
    </div>
  );
}
