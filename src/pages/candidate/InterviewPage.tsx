import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Clock,
  Mic,
  User,
  Bot,
  Loader2,
  Video,
  AlertTriangle,
  Maximize,
  Shield,
  Wifi,
  WifiOff,
  Square,
  LogOut,
  CheckCircle2,
  Circle,
  Volume2,
  CheckCircle,
  XCircle,
  EyeOff,
  Users,
  VolumeX,
  Timer,
  Monitor,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useTimer } from '@/hooks/useTimer';
import { useVoiceInterview } from '@/hooks/useVoiceInterview';
import { useQuestionTimer } from '@/hooks/useQuestionTimer';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import { useScreenRecorder } from '@/hooks/useScreenRecorder';
import { useFullscreen } from '@/hooks/useFullscreen';
// import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { aiService } from '@/services/ai.service';
import { interviewWsService } from '@/services/interview-ws.service';
import { AIAvatar } from '@/components/interview/AIAvatar';
import { CodingEditor } from '@/components/interview/CodingEditor';
import { CodeBlock } from '@/components/interview/CodeBlock';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { APP_CONFIG } from '@/config/app.config';
import { ROUTES } from '@/config/routes';
import { formatTimer } from '@/utils/format.utils';
import { interviewService } from '@/services/interview.service';
import type { InterviewSchedule } from '@/types/interview.types';
import { Play } from 'lucide-react';


type PostCompletionStep = 'ending' | 'uploading-screen' | 'done' | null;

export function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [interview, setInterview] = useState<InterviewSchedule | undefined>(
    (location.state as { interview?: InterviewSchedule })?.interview
  );
  const [loadingInterview, setLoadingInterview] = useState(false);

  // Voice interview hook (main orchestrator)
  const voiceInterview = useVoiceInterview();

  const [compileOutput, setCompileOutput] = useState<string>('');
  const [compiling, setCompiling] = useState(false);

  // Question answer timeout timer
  const questionTimer = useQuestionTimer({
    state: voiceInterview.state,
    isPlaying: voiceInterview.isPlaying,
    isCodingQuestion: voiceInterview.isCodingQuestion,
    onTimeout: () => {
      showToast('Please click the microphone to start answering.', 'warning');
      // No auto-skip — candidate must actively participate.
      // The inactivity timer will end the interview if they remain idle.
    },
    onMaxSkips: () => {
      showToast('Interview ending due to consecutive unanswered questions.', 'error');
      runPostCompletionFlowRef.current(false);
    },
  });

  // Proctoring warnings (local tracking for display)
  // const [tabWarnings, setTabWarnings] = useState(0);

  // Confirmation dialog state
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Post-completion flow state
  const [postCompletionStep, setPostCompletionStep] = useState<PostCompletionStep>(null);
  const postCompletionStartedRef = useRef(false);

  // Item 11: Permission check state
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  // Instruction countdown & audio narration
  const [instructionCountdown, setInstructionCountdown] = useState(APP_CONFIG.INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const { isSpeaking, speak: speakInstruction, stop: stopInstruction } = useSpeechSynthesis();

  // Answer recording time limit
  const [answerSecondsLeft, setAnswerSecondsLeft] = useState(APP_CONFIG.INTERVIEW_ANSWER_TIMEOUT_SECONDS);
  const answerTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Inactivity timer refs
  const inactivityWarningRef = useRef<number | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const inactivityWarningShownRef = useRef(false);

  // keep a ref for the post‑completion flow so it can be
  // invoked from the timer before the callback is defined.
  const runPostCompletionFlowRef = useRef<(skip: boolean) => void>(() => { });

  // Global timer (60 min)
  const { secondsLeft: globalSecondsLeft, start: startGlobalTimer } = useTimer({
    initialSeconds: APP_CONFIG.INTERVIEW_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => {
      showToast('Interview time is up. Ending interview.', 'warning');
      runPostCompletionFlowRef.current(false);
    },
  });

  // Camera stream for face detection only (no upload — screen recording handles that)
  const { start: startVideoRecording, stop: stopVideoRecording, isRecording: isVideoRecording, stream: recorderStream } = useMediaRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
  });

  // Screen recording — screen video + mic audio combined (auto-triggered at interview start)
  const [screenPermission, setScreenPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { start: startScreenRecording, stop: stopScreenRecording, stopAndGetBlob: stopScreenAndGetBlob, isRecording: isScreenRecording } = useScreenRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
    onScreenStop: () => {
      setScreenPermission('denied');
      showToast('Screen sharing stopped. This has been logged.', 'warning');
      voiceInterview.sendProctoringEvent('screen_share_stopped', 'Candidate stopped screen sharing');
    },
  });

  // Proctoring hooks
  const { isFullscreen, enterFullscreen, fullscreenExitCount } = useFullscreen({
    onExitAttempt: (count) => {
      showToast(`Fullscreen exit detected (${count}). Please return to fullscreen.`, 'warning');
      voiceInterview.sendProctoringEvent('fullscreen_exit', `Exit count: ${count}`);
    },
  });

  // Page visibility / tab switch detection
  // usePageVisibility({
  //   onHidden: () => {
  //     setTabWarnings((prev) => prev + 1);
  //     showToast('Tab switch detected. Please stay on this tab.', 'warning');
  //     voiceInterview.sendProctoringEvent('tab_switch', 'Tab switched');
  //     if (!voiceInterview.isWsConnected) {
  //       showToast('Connection lost, tab-switch event will be sent when reconnected.', 'info');
  //     }
  //   },
  // });

  // Face detection (proctoring)
  const {
    warningCount: faceWarnings,
    lookingAway,
    multipleFaces,
    loadModels,
    startDetection,
    stopDetection,
  } = useFaceDetection({
    maxWarnings: APP_CONFIG.FACE_DETECTION_MAX_WARNINGS,
    checkIntervalMs: APP_CONFIG.FACE_DETECTION_INTERVAL_MS,
    lookingAwayThreshold: APP_CONFIG.FACE_LOOKING_AWAY_THRESHOLD,
    lookingDownThreshold: APP_CONFIG.FACE_LOOKING_DOWN_THRESHOLD,
    lookingAwayConsecutiveFrames: APP_CONFIG.FACE_LOOKING_AWAY_CONSECUTIVE_FRAMES,
    onNoFace: () => {
      showToast('Face not detected. Please stay in front of the camera.', 'warning');
      voiceInterview.sendProctoringEvent('no_face', 'No face detected');
    },
    onMultipleFaces: (count) => {
      showToast(`Multiple faces detected (${count}). Only the candidate should be visible.`, 'warning');
      voiceInterview.sendProctoringEvent('multiple_faces', `Detected ${count} faces`);
    },
    onLookingAway: (direction) => {
      showToast(`Looking away detected (${direction}). Please look at the screen.`, 'warning');
      voiceInterview.sendProctoringEvent('looking_away', `Looking ${direction}`);
    },
  });

  // DevTools detection (proctoring)
  const { detectionCount: devToolsCount } = useDevToolsDetection();

  // Respond to devToolsCount changes in an effect (post-render).
  const prevDevToolsRef = useRef<number>(0);
  useEffect(() => {
    const prev = prevDevToolsRef.current;
    if (devToolsCount > prev) {
      showToast('Developer tools detected. Please close them.', 'warning');
      if (!voiceInterview.isWsConnected) {
        showToast('Connection lost, devtools event will be sent when reconnected.', 'info');
      }
      voiceInterview.sendProctoringEvent('devtools', 'DevTools detected');
    }
    prevDevToolsRef.current = devToolsCount;
  }, [devToolsCount, showToast, voiceInterview]);

  // Item 11: Pre-check mic/camera permissions on mount
  useEffect(() => {
    async function checkPermissions() {
      try {
        const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setMicPermission(micResult.state);
        micResult.onchange = () => setMicPermission(micResult.state);
      } catch {
        // Some browsers don't support permission query for microphone
        setMicPermission('prompt');
      }
      try {
        const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setCameraPermission(camResult.state);
        camResult.onchange = () => setCameraPermission(camResult.state);
      } catch {
        setCameraPermission('prompt');
      }
    }
    checkPermissions();
  }, []);

  // Instruction countdown timer (only runs on pre-start screen)
  useEffect(() => {
    if (voiceInterview.state !== 'pre-start') return;
    if (instructionCountdown <= 0) return;

    const timerId = window.setInterval(() => {
      setInstructionCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [voiceInterview.state, instructionCountdown <= 0]);

  // Audio narration of instructions on mount (pre-start only)
  const instructionAudioFiredRef = useRef(false);
  useEffect(() => {
    if (voiceInterview.state !== 'pre-start') return;

    // Small delay to avoid StrictMode double-invoke cancellation and
    // to ensure the page is fully rendered before speaking.
    const timerId = window.setTimeout(() => {
      if (instructionAudioFiredRef.current) return;
      instructionAudioFiredRef.current = true;

      const script =
        'Please read the instructions carefully before starting the interview process. ' +
        'The Start Interview button will be disabled for 60 seconds to give you time to read the instructions provided on this page. ' +
        'A countdown timer will start from 60 seconds and run down to zero. Once the timer reaches zero, the Start Interview button will be enabled. ' +
        'During the interview, you can answer the questions by clicking the microphone button and speaking your response. ' +
        'After completing your answer, turn off the microphone, and your response will automatically be sent to the interviewer for evaluation.';

      speakInstruction(script, { rate: 0.95 });
    }, 500);

    return () => {
      clearTimeout(timerId);
      // Reset ref on cleanup so StrictMode re-mount can re-fire
      instructionAudioFiredRef.current = false;
      stopInstruction();
    };
  }, [voiceInterview.state, speakInstruction, stopInstruction]);

  // Handle mute/unmute for instruction audio
  const toggleInstructionAudio = useCallback(() => {
    if (isAudioMuted) {
      setIsAudioMuted(false);
      // Re-read remaining instructions is not practical with SpeechSynthesis, so we just resume
      // SpeechSynthesis doesn't support pause/resume reliably across browsers, so mute = stop
    } else {
      stopInstruction();
      setIsAudioMuted(true);
    }
  }, [isAudioMuted, stopInstruction]);

  // Register websocket service error callback so we can show details
  useEffect(() => {
    const cb = (err: string) => {
      showToast(`WebSocket error: ${err}`, 'error');
    };
    interviewWsService.setErrorCallback(cb);
    return () => interviewWsService.setErrorCallback(null);
  }, [showToast]);

  // Fallback fetch if no interview from route state
  useEffect(() => {
    if (!interview && user?.email) {
      setLoadingInterview(true);
      interviewService
        .getActiveInterviews(user.email)
        .then((res) => {
          const active = (res.data ?? []).find(
            (i: InterviewSchedule) =>
              i.attemptStatus === 'NOT_ATTEMPTED' ||
              i.attemptStatus === 'IN_PROGRESS'
          );
          if (active) setInterview(active);
        })
        .catch(() => { })
        .finally(() => setLoadingInterview(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Total warnings calculation – now safe to compute
  // const totalWarnings =
  //   tabWarnings + faceWarnings + fullscreenExitCount + devToolsCount;

  const totalWarnings = faceWarnings + fullscreenExitCount + devToolsCount;

  // Post-completion flow — sequential steps after interview ends
  const runPostCompletionFlow = useCallback(
    async (skipEndCall: boolean) => {
      if (postCompletionStartedRef.current) return;
      postCompletionStartedRef.current = true;
      setShowEndConfirm(false);

      try {
        // Step 1: End interview
        setPostCompletionStep('ending');
        if (!skipEndCall) {
          await voiceInterview.endInterview();
        }
        stopDetection();

        // Step 2: Upload screen recording
        setPostCompletionStep('uploading-screen');
        try {
          const screenBlob = await stopScreenAndGetBlob();
          if (screenBlob && voiceInterview.scheduleId) {
            await aiService.uploadScreenRecording(voiceInterview.scheduleId, screenBlob);
          }
        } catch (err) {
          console.error('Screen recording upload failed:', err);
          // Continue even if upload fails
        }

        // Done — redirect to interviews list
        setPostCompletionStep('done');
        setTimeout(() => {
          navigate(ROUTES.CANDIDATE.INTERVIEWS);
        }, 1500);
      } catch (err) {
        console.error('Post-completion flow error:', err);
        navigate(ROUTES.CANDIDATE.INTERVIEWS);
      }
    },
    [voiceInterview, stopScreenAndGetBlob, stopDetection, navigate]
  );

  // make sure the ref points at the latest version
  useEffect(() => {
    runPostCompletionFlowRef.current = runPostCompletionFlow;
  }, [runPostCompletionFlow]);

  // Inactivity timer helpers
  const clearInactivityTimers = useCallback(() => {
    if (inactivityWarningRef.current) {
      clearTimeout(inactivityWarningRef.current);
      inactivityWarningRef.current = null;
    }
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    inactivityWarningShownRef.current = false;
  }, []);

  const startInactivityTimers = useCallback(() => {
    clearInactivityTimers();

    inactivityWarningRef.current = window.setTimeout(() => {
      inactivityWarningShownRef.current = true;
      showToast('You have been inactive. Please respond soon or the interview will end automatically.', 'warning');
    }, APP_CONFIG.INTERVIEW_INACTIVITY_WARNING_SECONDS * 1000);

    inactivityTimeoutRef.current = window.setTimeout(() => {
      showToast('Interview ending due to inactivity.', 'error');
      runPostCompletionFlowRef.current(false);
    }, APP_CONFIG.INTERVIEW_INACTIVITY_TIMEOUT_SECONDS * 1000);
  }, [clearInactivityTimers, showToast]);

  // Start/clear inactivity timers based on interview state
  useEffect(() => {
    if (voiceInterview.state === 'active' && !voiceInterview.isPlaying) {
      startInactivityTimers();
    } else {
      clearInactivityTimers();
    }
    return () => clearInactivityTimers();
  }, [voiceInterview.state, voiceInterview.isPlaying, startInactivityTimers, clearInactivityTimers]);

  // Answer recording time limit — start countdown when answering, auto-submit on expiry
  const submitAnswerRef = useRef(voiceInterview.submitAnswer);
  submitAnswerRef.current = voiceInterview.submitAnswer;

  useEffect(() => {
    if (voiceInterview.state === 'answering') {
      // Reset and start answer countdown
      setAnswerSecondsLeft(APP_CONFIG.INTERVIEW_ANSWER_TIMEOUT_SECONDS);
      answerTimerRef.current = window.setInterval(() => {
        setAnswerSecondsLeft((prev) => {
          if (prev <= 1) {
            // Time's up — auto-submit
            if (answerTimerRef.current) {
              clearInterval(answerTimerRef.current);
              answerTimerRef.current = null;
            }
            showToast('Answer time limit reached. Submitting your answer.', 'warning');
            submitAnswerRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Clear timer when not answering
      if (answerTimerRef.current) {
        clearInterval(answerTimerRef.current);
        answerTimerRef.current = null;
      }
    }
    return () => {
      if (answerTimerRef.current) {
        clearInterval(answerTimerRef.current);
        answerTimerRef.current = null;
      }
    };
  }, [voiceInterview.state, showToast]);

  // Reset consecutive skip counter when candidate starts answering
  useEffect(() => {
    if (voiceInterview.state === 'answering') {
      questionTimer.resetSkipCounter();
    }
  }, [voiceInterview.state, questionTimer]);

  // Auto-end interview when max warnings reached
  useEffect(() => {
    if (voiceInterview.state !== 'pre-start' && voiceInterview.state !== 'completed' &&
      totalWarnings >= APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS) {
      showToast('Maximum proctoring warnings reached. Ending interview.', 'error');
      runPostCompletionFlow(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalWarnings]);

  const handleCompile = async () => {
    if (!voiceInterview.codeContent.trim()) {
      showToast('Please write some code first', 'warning');
      return;
    }
    setCompiling(true);
    try {
      const res = await aiService.compileCode({
        code: voiceInterview.codeContent,
        language: voiceInterview.codeLanguage,
      });
      const output = res.data.output || res.data.error;
      setCompileOutput(output);
    } catch (err: any) {
      setCompileOutput('Compilation failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCompiling(false);
    }
  };

  useEffect(() => {
    // When a new interviewer message appears (especially a coding question), clear output
    setCompileOutput('');
  }, [voiceInterview.conversation.length, voiceInterview.isCodingQuestion]);

  // Use the recorder's stream for video preview
  useEffect(() => {
    if (videoRef.current && recorderStream) {
      videoRef.current.srcObject = recorderStream;
    }
  }, [recorderStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoRecording();
      stopScreenRecording();
      stopDetection();
      clearInactivityTimers();
      if (answerTimerRef.current) {
        clearInterval(answerTimerRef.current);
      }
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [voiceInterview.conversation, voiceInterview.streamingText]);

  // Detect natural completion or backend-triggered end → run post-completion flow
  useEffect(() => {
    if (voiceInterview.state === 'completed' && !postCompletionStartedRef.current) {
      runPostCompletionFlow(true); // skip end call — backend already marked complete
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInterview.state]);

  const handleStartInterview = async () => {
    if (!interview || !user?.email) return;

    // Stop instruction audio if still playing
    stopInstruction();

    try {
      // Enter fullscreen
      await enterFullscreen();

      // Load face detection models
      await loadModels();

      // Start voice interview
      await voiceInterview.startInterview({
        email: user.email,
        jobPrefix: interview.jobPrefix,
      });

      // Start timers
      startGlobalTimer();

      // Start video recording and attach stream to video element for face detection
      try {
        const mediaStream = await startVideoRecording({ audio: true, video: true });
        if (videoRef.current && mediaStream) {
          videoRef.current.srcObject = mediaStream;
          startDetection(videoRef.current);
        }
      } catch {
        showToast('Could not start video recording.', 'warning');
      }

      // Start screen recording (screen + mic combined) — browser shows share dialog here
      try {
        await startScreenRecording();
        setScreenPermission('granted');
      } catch {
        setScreenPermission('denied');
        voiceInterview.sendProctoringEvent('screen_share_denied', 'Screen recording permission denied');
      }
    } catch {
      // Error handling in voiceInterview hook
    }
  };

  // Warning color based on severity
  const getWarningColor = () => {
    if (totalWarnings >= 4) return 'text-red-500';
    if (totalWarnings >= 2) return 'text-amber-500';
    return 'text-emerald-500';
  };

  // Post-completion step status helper
  const getStepStatus = (step: 'ending' | 'uploading-screen') => {
    const order: PostCompletionStep[] = ['ending', 'uploading-screen', 'done'];
    const currentIdx = order.indexOf(postCompletionStep);
    const stepIdx = order.indexOf(step);
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
  };

  // Item 11: Permission icon helper
  const PermissionIcon = ({ status }: { status: string }) => {
    if (status === 'granted') return <CheckCircle size={16} className="text-emerald-500" />;
    if (status === 'denied') return <XCircle size={16} className="text-red-500" />;
    if (status === 'checking') return <Loader2 size={16} className="animate-spin text-gray-400" />;
    return <Circle size={16} className="text-amber-500" />;
  };

  if (loadingInterview) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">No interview data found.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.INTERVIEWS)}>
          Back to Interviews
        </Button>
      </div>
    );
  }



  // Pre-start screen
  const isCountdownActive = instructionCountdown > 0;
  const canStartInterview = !isCountdownActive && micPermission !== 'denied';

  if (voiceInterview.state === 'pre-start' || voiceInterview.state === 'starting') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Video className="w-10 h-10 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)]">AI Voice Interview</h1>
          <p className="text-[var(--textSecondary)]">
            You are about to start a real-time voice interview for{' '}
            <strong className="text-[var(--text)]">{interview.jobPrefix}</strong>. The interview
            will last up to {APP_CONFIG.INTERVIEW_TIMER_MINUTES} minutes.
          </p>

          {/* Audio narration indicator + mute toggle */}
          <div className="flex items-center justify-center gap-3">
            {isSpeaking && !isAudioMuted && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Volume2 size={14} className="text-blue-500 animate-pulse" />
                <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Reading instructions...</span>
              </div>
            )}
            <button
              type="button"
              onClick={toggleInstructionAudio}
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

          {/* Countdown timer display */}
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

          {/* Item 11: Permission checks */}
          <div className="space-y-2 text-left p-4 rounded-lg bg-[var(--surface1)]">
            <p className="text-sm font-semibold text-[var(--text)] mb-3">Permission Check</p>
            <div className="flex items-center gap-2">
              <PermissionIcon status={micPermission} />
              <span className="text-sm text-[var(--text)]">Microphone</span>
              {micPermission === 'denied' && (
                <span className="text-xs text-red-500 ml-auto">Please enable in browser settings</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PermissionIcon status={cameraPermission} />
              <span className="text-sm text-[var(--text)]">Camera</span>
              {cameraPermission === 'denied' && (
                <span className="text-xs text-red-500 ml-auto">Please enable in browser settings</span>
              )}
            </div>
          </div>

          {/* Item 13: Proctoring Rules */}
          <div className="space-y-2 text-left p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Proctoring Rules</p>
            </div>
            <ul className="space-y-1.5 text-sm text-amber-700 dark:text-amber-300">
              <li className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span><strong>Tab switching</strong> is detected and will count as a warning.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span><strong>Multiple faces</strong> or <strong>no face</strong> detected will trigger warnings.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span><strong>Exiting fullscreen</strong> or opening <strong>developer tools</strong> will trigger warnings.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>Maximum of <strong>{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS} warnings</strong> allowed.</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
                <span className="text-red-600 dark:text-red-400">
                  Exceeding the limit will <strong>terminate the interview</strong> and mark it as <strong>FAILED</strong>.
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-2 text-left p-4 rounded-lg bg-[var(--surface1)]">
            <p className="text-sm text-[var(--text)]">
              - This is a voice-to-voice conversation with an AI interviewer.
            </p>
            <p className="text-sm text-[var(--text)]">
              - Click the microphone button to start speaking. Click the stop button when done.
            </p>
            <p className="text-sm text-[var(--text)]">
              - Your speech will be transcribed in real-time (you'll see it on screen).
            </p>
            <p className="text-sm text-[var(--text)]">
              - The interviewer will respond with voice and text.
            </p>
            <p className="text-sm text-[var(--text)]">
              - Video will be recorded for proctoring purposes.
            </p>
          </div>

          {voiceInterview.error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {voiceInterview.error}
            </div>
          )}

          <Button
            size="lg"
            onClick={handleStartInterview}
            isLoading={voiceInterview.state === 'starting'}
            disabled={!canStartInterview}
          >
            {micPermission === 'denied'
              ? 'Microphone Permission Required'
              : isCountdownActive
                ? `Start Interview (${instructionCountdown}s)`
                : 'Start Interview'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--background)] flex flex-col">
      {/* Item 10: Persistent WS disconnect banner */}
      {!voiceInterview.isWsConnected && voiceInterview.state !== 'completed' && !postCompletionStep && (
        <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-50">
          <WifiOff size={16} />
          <span>Connection lost. Reconnecting... (attempt {interviewWsService.currentReconnectAttempts})</span>
          <Loader2 size={14} className="animate-spin" />
        </div>
      )}

      {/* Post-completion overlay */}
      {postCompletionStep && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[var(--cardBg)] rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
            <h2 className="text-xl font-bold text-[var(--text)]">Finishing Interview...</h2>
            <div className="space-y-4 text-left">
              {/* Step 1: Ending */}
              <div className="flex items-center gap-3">
                {getStepStatus('ending') === 'done' ? (
                  <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
                ) : getStepStatus('ending') === 'active' ? (
                  <Loader2 size={20} className="text-blue-500 animate-spin flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-sm ${getStepStatus('ending') === 'pending' ? 'text-gray-400' : 'text-[var(--text)]'}`}>
                  Ending interview
                </span>
              </div>

              {/* Step 2: Uploading screen recording */}
              <div className="flex items-center gap-3">
                {getStepStatus('uploading-screen') === 'done' ? (
                  <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
                ) : getStepStatus('uploading-screen') === 'active' ? (
                  <Loader2 size={20} className="text-blue-500 animate-spin flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-sm ${getStepStatus('uploading-screen') === 'pending' ? 'text-gray-400' : 'text-[var(--text)]'}`}>
                  Uploading screen recording
                </span>
              </div>
            </div>

            {postCompletionStep === 'done' && (
              <p className="text-sm text-emerald-500 font-medium">
                All done! Redirecting...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog for ending interview early */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={() => runPostCompletionFlow(false)}
        title="End Interview Early?"
        message="This action cannot be undone. Your responses so far will be evaluated, but unanswered questions may affect your overall score."
        confirmText="End Interview"
        cancelText="Continue Interview"
        variant="warning"
      />

      {/* Fullscreen enforcement overlay */}
      {!isFullscreen && voiceInterview.state !== 'completed' && !postCompletionStep && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[var(--cardBg)] rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Maximize className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">Fullscreen Required</h2>
            <p className="text-sm text-[var(--textSecondary)]">
              The interview must be conducted in fullscreen mode. Please return to fullscreen to continue.
            </p>
            <Button onClick={enterFullscreen} size="lg">
              Return to Fullscreen
            </Button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-[var(--cardBg)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Badge variant="info">Voice Interview</Badge>
            <span className="text-sm text-[var(--textSecondary)]">{interview.jobPrefix}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Screen recording indicator */}
            {isScreenRecording && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <Monitor size={12} className="text-red-500" />
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">Screen REC</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              </div>
            )}
            {screenPermission === 'denied' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Monitor size={12} className="text-amber-500" />
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Screen Off</span>
              </div>
            )}
            {/* WebSocket connection status */}
            <div className="flex items-center gap-1">
              {voiceInterview.isWsConnected ? (
                <Wifi size={14} className="text-emerald-500" />
              ) : (
                <WifiOff size={14} className="text-red-500" />
              )}
            </div>

            {/* Questions asked */}
            <span className="text-xs text-[var(--textSecondary)]">
              Q: {voiceInterview.questionsAsked}
            </span>

            {/* Global Timer */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${globalSecondsLeft <= 300
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-[var(--surface1)] text-[var(--text)]'
                }`}
            >
              <Clock size={16} />
              {formatTimer(globalSecondsLeft)}
            </div>

            {/* Proctoring Warning Pill */}
            <div className="relative group">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface1)] cursor-default ${getWarningColor()}`}
              >
                <Shield size={14} />
                <span className="text-xs font-semibold">{totalWarnings}/{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS}</span>
              </div>
              {/* Warning breakdown tooltip */}
              <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--cardBg)] rounded-lg shadow-lg border border-[var(--border)] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                <p className="text-xs font-semibold text-[var(--text)] mb-2">Warning Breakdown</p>
                <div className="space-y-1.5 text-xs text-[var(--textSecondary)]">
                  {/* <div className="flex justify-between">
                    <span>Tab Switches</span>
                    <span className="font-mono">{tabWarnings}</span>
                  </div> */}
                  <div className="flex justify-between">
                    <span>Face Warnings</span>
                    <span className="font-mono">{faceWarnings}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fullscreen Exits</span>
                    <span className="font-mono">{fullscreenExitCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DevTools</span>
                    <span className="font-mono">{devToolsCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* End Interview */}
            <button
              onClick={() => setShowEndConfirm(true)}
              disabled={!!postCompletionStep}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <LogOut size={14} />
              End
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-6xl mx-auto w-full min-h-0">
        {/* Left Column: Avatar + Conversation + Voice Controls */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* AI Avatar Section */}
          <div className="flex justify-center py-6 border-b border-[var(--border)]">
            <AIAvatar
              isSpeaking={voiceInterview.isPlaying}
              isListening={voiceInterview.isRecording}
              isThinking={voiceInterview.state === 'processing'}
              amplitude={voiceInterview.amplitude}
              size="md"
            />
          </div>

          {/* Conversation Area */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            {voiceInterview.conversation.map((entry, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 ${entry.role === 'candidate' ? 'flex-row-reverse' : ''} ${entry.role === 'filler' ? 'opacity-60' : ''
                  }`}
              >
                {/* Avatar icons – skip for system */}
                {entry.role !== 'filler' && entry.role !== 'system' && (
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.role === 'interviewer'
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-green-100 dark:bg-green-900/30'
                      }`}
                  >
                    {entry.role === 'interviewer' ? (
                      <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <User className="w-4 h-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[70%] p-4 rounded-lg ${entry.role === 'interviewer'
                    ? 'bg-[var(--surface1)] text-[var(--text)]'
                    : entry.role === 'candidate'
                      ? 'bg-[var(--primary)] text-white'
                      : entry.role === 'system'
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm border border-amber-200 dark:border-amber-800'
                        : 'bg-transparent text-[var(--textTertiary)] italic text-sm p-2'
                    } ${entry.isStreaming ? 'border border-blue-300 dark:border-blue-700' : ''}`}
                >
                  <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                  {entry.role !== 'filler' && entry.role !== 'system' && (
                    <p
                      className={`text-xs mt-2 ${entry.role === 'interviewer'
                        ? 'text-[var(--textTertiary)]'
                        : 'text-white/70'
                        }`}
                    >
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {voiceInterview.state === 'processing' && !voiceInterview.streamingText && (
              <div className="flex items-center gap-2 text-[var(--textSecondary)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Processing your answer...</span>
              </div>
            )}

            {voiceInterview.state === 'completed' && !postCompletionStep && (
              <div className="text-center py-4">
                <Badge variant="success" size="lg">
                  Interview Complete
                </Badge>
                <p className="text-sm text-[var(--textSecondary)] mt-2">
                  Generating evaluation...
                </p>
              </div>
            )}
          </div>

          {/* Coding Editor — appears only for [CODING] questions 
     /*     {voiceInterview.isCodingQuestion && voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <CodingEditor
                code={voiceInterview.codeContent}
                language={voiceInterview.codeLanguage}
                onCodeChange={voiceInterview.setCodeContent}
                onLanguageChange={voiceInterview.setCodeLanguage}
                disabled={voiceInterview.state === 'processing'}
              />
            </div>
          )} */}

          {voiceInterview.isCodingQuestion && voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
              <CodingEditor
                code={voiceInterview.codeContent}
                language={voiceInterview.codeLanguage}
                onCodeChange={voiceInterview.setCodeContent}
                onLanguageChange={voiceInterview.setCodeLanguage}
                disabled={voiceInterview.state === 'processing'}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCompile}
                  disabled={compiling || !voiceInterview.codeContent.trim()}
                >
                  {compiling ? (
                    <Loader2 size={14} className="animate-spin mr-2" />
                  ) : (
                    <Play size={14} className="mr-2" />
                  )}
                  Compile & Run
                </Button>
              </div>
              {compileOutput && (
                <div className="mt-2 p-3 rounded-lg bg-[#1e1e1e] text-gray-200 font-mono text-sm overflow-auto max-h-48">
                  <pre className="whitespace-pre-wrap">{compileOutput}</pre>
                </div>
              )}
            </div>
          )}

          {/* Voice Controls Area */}
          {voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="border-t border-[var(--border)] bg-[var(--cardBg)] p-4">
              {/* Transcription error warning */}
              {voiceInterview.transcriptionError && (
                <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Speech not captured: {voiceInterview.transcriptionError}
                  </span>
                </div>
              )}

              {/* Real-time transcript display during recording */}
              {voiceInterview.isRecording && voiceInterview.currentTranscript && (
                <div className="mb-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <p className="text-xs text-[var(--textTertiary)] mb-1">Live Transcription:</p>
                  <p className="text-sm text-[var(--text)]">{voiceInterview.currentTranscript}</p>
                </div>
              )}

              {/* Item 12: Audio level indicator during recording */}
              {voiceInterview.isRecording && (
                <div className="mb-3 flex items-center gap-2">
                  <Mic size={14} className="text-red-500" />
                  <div className="flex-1 h-2 bg-[var(--surface1)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-75"
                      style={{ width: `${voiceInterview.audioLevel ?? 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--textTertiary)] w-8 text-right">{voiceInterview.audioLevel ?? 0}%</span>
                </div>
              )}

              {/* Question answer countdown timer */}
              {questionTimer.isTimerActive && voiceInterview.state === 'active' && !voiceInterview.isPlaying && (
                <div className="mb-3 flex items-center justify-center gap-3">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${questionTimer.secondsLeft <= 10
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : questionTimer.secondsLeft <= 20
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                      : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                    }`}>
                    <Timer size={16} className={
                      questionTimer.secondsLeft <= 10
                        ? 'text-red-500 animate-pulse'
                        : questionTimer.secondsLeft <= 20
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                    } />
                    <span className={`text-lg font-mono font-bold ${questionTimer.secondsLeft <= 10
                      ? 'text-red-600 dark:text-red-400'
                      : questionTimer.secondsLeft <= 20
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                      {questionTimer.secondsLeft}s
                    </span>
                    <span className={`text-xs ${questionTimer.secondsLeft <= 10
                      ? 'text-red-500'
                      : questionTimer.secondsLeft <= 20
                        ? 'text-amber-500'
                        : 'text-emerald-500'
                      }`}>
                      to answer
                    </span>
                  </div>
                  {questionTimer.consecutiveSkips > 0 && (
                    <span className="text-xs text-amber-500 font-medium">
                      Skipped: {questionTimer.consecutiveSkips}/{APP_CONFIG.INTERVIEW_MAX_CONSECUTIVE_SKIPS}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                {/* Mic button - main interaction */}
                {voiceInterview.state === 'active' && (
                  <>
                    <button
                      onClick={() => {
                        if (!voiceInterview.isWsConnected) {
                          showToast('Still connecting to server, please wait...', 'info');
                          return;
                        }
                        voiceInterview.startAnswering();
                      }}
                      disabled={!voiceInterview.isWsConnected || voiceInterview.isPlaying}
                      className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-lg hover:shadow-xl"
                      title={voiceInterview.isWsConnected ? 'Start speaking' : 'Connecting...'}
                    >
                      <Mic size={28} />
                    </button>

                    {/* Item 14: Repeat question button */}
                    <button
                      onClick={voiceInterview.repeatQuestion}
                      className="w-10 h-10 rounded-full bg-[var(--surface1)] hover:bg-[var(--border)] text-[var(--textSecondary)] flex items-center justify-center transition-colors"
                      title="Repeat last question"
                    >
                      <Volume2 size={18} />
                    </button>
                  </>
                )}

                {voiceInterview.state === 'answering' && (
                  <>
                    {/* Recording indicator */}
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm text-red-400 font-medium">Recording...</span>
                    </div>

                    {/* Answer time limit countdown */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${answerSecondsLeft <= 30
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : answerSecondsLeft <= 60
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'bg-[var(--surface1)] text-[var(--text)]'
                      }`}>
                      <Timer size={14} className={answerSecondsLeft <= 30 ? 'animate-pulse' : ''} />
                      {Math.floor(answerSecondsLeft / 60)}:{String(answerSecondsLeft % 60).padStart(2, '0')}
                    </div>

                    <button
                      onClick={() => voiceInterview.submitAnswer()}
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg hover:shadow-xl animate-pulse"
                      title="Stop recording and submit answer"
                    >
                      <Square size={24} />
                    </button>
                  </>
                )}

                {voiceInterview.state === 'processing' && (
                  <div className="flex items-center gap-2 text-[var(--textSecondary)]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">AI is responding...</span>
                  </div>
                )}
              </div>

              {/* State hint */}
              <div className="text-center mt-2">
                {voiceInterview.state === 'active' && !voiceInterview.isPlaying && (
                  <p className="text-xs text-[var(--textTertiary)]">
                    {voiceInterview.isCodingQuestion
                      ? 'Write code in the editor above. Click mic to add a voice explanation, then stop to submit both.'
                      : 'Click the mic to start answering before time runs out'}
                  </p>
                )}
                {voiceInterview.state === 'active' && voiceInterview.isPlaying && (
                  <p className="text-xs text-[var(--textTertiary)]">
                    Interviewer is speaking... wait for them to finish
                  </p>
                )}
                {voiceInterview.state === 'answering' && (
                  <p className="text-xs text-[var(--textTertiary)]">
                    {voiceInterview.isCodingQuestion
                      ? 'Speaking your explanation... Click stop when done to submit code and voice together.'
                      : 'Speak clearly. Click the stop button when done.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Video + Proctoring */}
        <div className="w-72 border-l border-[var(--border)] bg-[var(--cardBg)] p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Video Preview */}
          <div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-2">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--textSecondary)]">
              <Video size={12} />
              <span>{isVideoRecording ? 'Recording' : 'Camera'}</span>
              {isVideoRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
          </div>

          {/* Interviewer Info */}
          <div className="p-3 rounded-lg bg-[var(--surface1)]">
            <p className="text-xs text-[var(--textTertiary)] mb-1">Interviewer</p>
            <p className="text-sm font-medium text-[var(--text)]">{voiceInterview.interviewerName}</p>
          </div>

          {/* Proctoring Status */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">
              Proctoring Status
            </h3>

            <div className="space-y-2 text-xs">
              {/* <div className="flex items-center justify-between">
                <span className="text-[var(--textSecondary)]">Tab Switches</span>
                <span className={`font-mono font-semibold ${tabWarnings > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {tabWarnings}
                </span>
              </div> */}
              <div className="flex items-center justify-between">
                <span className="text-[var(--textSecondary)]">Face Warnings</span>
                <span className={`font-mono font-semibold ${faceWarnings > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {faceWarnings}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--textSecondary)]">Fullscreen Exits</span>
                <span className={`font-mono font-semibold ${fullscreenExitCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {fullscreenExitCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--textSecondary)]">DevTools</span>
                <span className={`font-mono font-semibold ${devToolsCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {devToolsCount}
                </span>
              </div>

              {/* Looking Away indicator */}
              {lookingAway && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <EyeOff size={14} className="text-amber-500" />
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                    Looking Away
                  </span>
                </div>
              )}

              {/* Multiple Faces indicator */}
              {multipleFaces && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <Users size={14} className="text-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Multiple Faces
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--textSecondary)] font-medium">Total Warnings</span>
                  <span className={`font-mono font-bold ${getWarningColor()}`}>
                    {totalWarnings}/{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS}
                  </span>
                </div>
              </div>
            </div>

            {totalWarnings > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {totalWarnings >= 4
                    ? 'Critical: One more warning will end the interview.'
                    : 'Please follow the interview guidelines to avoid warnings.'}
                </p>
              </div>
            )}
          </div>

          {/* Audio recording indicator */}
          {voiceInterview.isRecording && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <Mic size={14} className="text-red-500" />
              <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                Audio Recording Active
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
