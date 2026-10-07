import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Clock, Mic, User, Bot, Loader2, Video, AlertTriangle, Maximize, Shield,
  Wifi, WifiOff, Square, LogOut, CheckCircle2, Volume2,
  EyeOff, Users, Timer, Monitor, MonitorUp, Play, Send, Smartphone, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useTimer } from '@/hooks/useTimer';
import { useVoiceInterview } from '@/hooks/useVoiceInterview';
import { useQuestionTimer } from '@/hooks/useQuestionTimer';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import { useScreenRecorder } from '@/hooks/useScreenRecorder';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { aiService } from '@/services/ai.service';
import { interviewWsService } from '@/services/interview-ws.service';
import { interviewService } from '@/services/interview.service';
import { parseServerInstant } from '@/utils/format.utils';
import { AIAvatar } from '@/components/interview/AIAvatar';
import { CodingEditor } from '@/components/interview/CodingEditor';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { APP_CONFIG } from '@/config/app.config';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { ROUTES } from '@/config/routes';
import { MESSAGES } from '@/config/messages';
import { InterviewPreStartScreen } from '@/components/interview/InterviewPreStartScreen';
import { buildProctoringRules } from '@/components/interview/interview-rules';
import { formatTimer } from '@/utils/format.utils';
import type { InterviewSchedule } from '@/types/interview.types';

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

  // Voice interview hook
  const voiceInterview = useVoiceInterview();

  // Compilation state
  const [compileOutput, setCompileOutput] = useState<string>('');
  const [compiling, setCompiling] = useState(false);

  // Mobile companion state
  /**
   * Whether the identity photo and room sweep are both done.
   *
   * Gates the start button, but only while at least one of them is switched on
   * — the pre-start screen reads the same VITE_PROCTORING_* values as the exam
   * and hides the step entirely where both are off.
   */
  const [capturesReady, setCapturesReady] = useState(false);
  /**
   * The candidate has declared they are going ahead without a phone.
   *
   * A deliberate tick rather than an inference from "they pressed Start
   * anyway": where the phone is optional the start button used to be live from
   * the moment the QR appeared, so the second camera was skipped by people who
   * never realised it was on offer. Now the waiver is the thing that opens the
   * button, and it is only ever offered where the config says a phone is
   * optional.
   */
  const [mobileSkipped, setMobileSkipped] = useState(false);
  const [mobileToken, setMobileToken] = useState<string | null>(null);
  const [mobileConnected, setMobileConnected] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);
  const [isSetupActive, setIsSetupActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  /** Whether the paired phone is offering its microphone as well as its camera. */
  const [mobileAudioAvailable, setMobileAudioAvailable] = useState(false);
  /**
   * Which microphone answers are recorded from.
   *
   * Starts on this device and stays there unless the candidate says otherwise.
   * The phone is often on a stand across the room for the second camera angle,
   * where it is the worse microphone, not the better one — so switching to it
   * automatically would quietly degrade the interview it is meant to improve.
   */
  const [micSource, setMicSource] = useState<'device' | 'phone'>('device');

  // Question timer
  const questionTimer = useQuestionTimer({
    state: voiceInterview.state,
    isPlaying: voiceInterview.isPlaying,
    isCodingQuestion: voiceInterview.isCodingQuestion,
    onTimeout: () => {
      showToast(MESSAGES.interview.micToStart, 'warning');
    },
    onMaxSkips: () => {
      // Warned, not ended. This used to close the interview after three
      // questions went unanswered — and the commonest reason for that is a
      // microphone that is not working, which is the one case where taking
      // the interview away is both the harshest outcome and the least
      // deserved. A candidate thinking hard about three coding problems hit
      // it too. The silence is recorded for the reviewer, who can see the
      // transcript and judge it.
      showToast(MESSAGES.interview.consecutiveUnanswered, 'warning');
      voiceInterview.sendProctoringEvent(
        'questions_unanswered',
        'Three consecutive questions passed without an answer',
      );
    },
  });

  // Confirmation dialog
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  /**
   * The rules, reachable from inside the interview.
   *
   * They were read once on the instructions screen and then gone. A candidate
   * ten minutes in who cannot remember whether leaving fullscreen costs them a
   * warning had no way to check without leaving fullscreen to find out — so the
   * same list the instructions screen builds is one button away throughout.
   */
  const [showRules, setShowRules] = useState(false);
  const [postCompletionStep, setPostCompletionStep] = useState<PostCompletionStep>(null);
  const postCompletionStartedRef = useRef(false);

  // Permissions
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  // Instruction countdown & audio narration
  // Annotated because APP_CONFIG is `as const`: inferred, these are the literal
  // types 30 and 600, and a countdown that cannot hold 29 is not a countdown.
  const [instructionCountdown, setInstructionCountdown] = useState<number>(
    APP_CONFIG.INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS,
  );
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const { isSpeaking, speak: speakInstruction, stop: stopInstruction } = useSpeechSynthesis();

  // Answer timer
  const [answerSecondsLeft, setAnswerSecondsLeft] = useState<number>(
    APP_CONFIG.INTERVIEW_ANSWER_TIMEOUT_SECONDS,
  );
  const answerTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  /** The scrolling left column, and the coding block inside it. */
  const columnRef = useRef<HTMLDivElement>(null);
  const codingSectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenPreviewRef = useRef<HTMLVideoElement>(null);

  // Inactivity timers
  const inactivityWarningRef = useRef<number | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const inactivityWarningShownRef = useRef(false);
  /** "Are you still there?" — a question, never a countdown to ending. */
  const [stillThereOpen, setStillThereOpen] = useState(false);
  /**
   * The question on the table, for the panel above the code editor.
   *
   * The last thing the interviewer said, which is the question being answered.
   * Fillers and system notices are skipped — neither is a question.
   */
  const currentQuestion = useMemo(() => {
    const interviewerTurns = voiceInterview.conversation.filter(
      (entry) => entry.role === 'interviewer',
    );
    return interviewerTurns.length > 0
      ? interviewerTurns[interviewerTurns.length - 1].content
      : null;
  }, [voiceInterview.conversation]);
  const runPostCompletionFlowRef = useRef<(skip: boolean) => void>(() => { });

  // Global timer
  const { secondsLeft: globalSecondsLeft, start: startGlobalTimer, startAt: startGlobalTimerAt } = useTimer({
    initialSeconds: APP_CONFIG.INTERVIEW_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => {
      showToast(MESSAGES.interview.timeUp, 'warning');
      runPostCompletionFlowRef.current(false);
    },
  });

  // Elapsed, for display. Derived from the countdown rather than kept as a
  // second clock so the two can never disagree, and so a reload — which
  // re-anchors the countdown to the server's deadline — resumes the count-up
  // where it really was instead of from zero.
  const totalInterviewSeconds = APP_CONFIG.INTERVIEW_TIMER_MINUTES * 60;
  const elapsedSeconds = Math.min(totalInterviewSeconds, Math.max(0, totalInterviewSeconds - globalSecondsLeft));

  const segmentMs = APP_CONFIG.RECORDING_SEGMENT_MINUTES > 0
    ? APP_CONFIG.RECORDING_SEGMENT_MINUTES * 60_000
    : undefined;

  // Camera stream for face detection
  const {
    start: startVideoRecording,
    stop: stopVideoRecording,
    stopAndGetBlob: stopVideoAndGetBlob,
    isRecording: isVideoRecording,
    stream: recorderStream,
  } = useMediaRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
    // Stream-only when the camera recording is switched off: face detection
    // still needs live frames, and taking the camera down to stop the recording
    // would quietly take the face check with it.
    record: PROCTORING_CONFIG.recording.camera.required,
    segmentMs,
    // Chunks are kept in the browser's own store as they are recorded and
    // finished parts upload in the background, so the recording survives a
    // closed tab and the candidate never waits on it. Only where the camera
    // recording is switched on: a stream-only camera has nothing to store.
    persist: PROCTORING_CONFIG.recording.camera.required
      ? { scheduleId: () => voiceInterview.scheduleId }
      : undefined,
    // Put on the interview's record, not just the console: a camera that was
    // taken away mid-interview is why a recording is short or missing, and the
    // reviewer would otherwise see only the gap.
    onProblem: (message) => {
      console.warn('Camera recording:', message);
      voiceInterview.sendProctoringEvent('camera_recording_issue', message);
    },
  });

  // Screen recording
  const [screenPermission, setScreenPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { start: startScreenRecording, stop: stopScreenRecording, resume: resumeScreenRecording, stopAndGetSegments: stopScreenAndGetSegments, isRecording: isScreenRecording, stoppedEarly: screenShareStoppedEarly, screenStream } = useScreenRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
    segmentMs,
    persist: PROCTORING_CONFIG.recording.screen.required
      ? { scheduleId: () => voiceInterview.scheduleId }
      : undefined,
    // Read at record time, not now: the audio graph is built when the first
    // question is spoken, which is after the recording has already started.
    getInterviewerAudio: () => voiceInterview.getInterviewerAudioStream(),
    onScreenStop: () => {
      // Nothing was asked for, so nothing can have been stopped. Without this
      // guard a deployment with screen recording switched off could still fire
      // a "candidate stopped sharing" proctoring event off a stray track end.
      if (!PROCTORING_CONFIG.recording.screen.required) return;
      setScreenPermission('denied');
      showToast(MESSAGES.interview.screenShareStopped, 'warning');
      voiceInterview.sendProctoringEvent('screen_share_stopped', 'Candidate stopped screen sharing');
    },
  });

  /**
   * Pick screen sharing back up after it stopped.
   *
   * <p>There was no way to do this: a candidate who closed the shared window
   * by accident, or hit Chrome's own "Stop sharing" bar, spent the rest of the
   * interview with nothing being captured and a panel that told them it could
   * not be restarted. It can — the footage recorded before the stop is kept
   * and the new share is saved as a second part, so only the gap is lost.</p>
   *
   * <p>Dismissing the browser's picker is not a failure worth logging. It
   * leaves the prompt on screen, which is the whole message.</p>
   */
  const [resharingScreen, setResharingScreen] = useState(false);
  const handleReshareScreen = useCallback(async () => {
    setResharingScreen(true);
    try {
      await resumeScreenRecording();
      setScreenPermission('granted');
      showToast('Screen sharing resumed — recording has continued.', 'success');
      voiceInterview.sendProctoringEvent(
        'screen_share_resumed',
        'Candidate resumed screen sharing',
      );
    } catch {
      showToast('Nothing was shared. Choose a screen to carry on recording.', 'warning');
    } finally {
      setResharingScreen(false);
    }
    // voiceInterview is a fresh object every render; only the send method is
    // used here and it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeScreenRecording, showToast]);

  // Fullscreen
  const { isFullscreen, enterFullscreen, fullscreenExitCount } = useFullscreen({
    onExitAttempt: (count) => {
      showToast(MESSAGES.interview.fullscreenExit(count), 'warning');
      voiceInterview.sendProctoringEvent('fullscreen_exit', `Exit count: ${count}`);
    },
  });

  // Face detection
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
      showToast(MESSAGES.interview.faceNotDetected, 'warning');
      voiceInterview.sendProctoringEvent('no_face', 'No face detected');
    },
    onMultipleFaces: (count) => {
      showToast(MESSAGES.interview.multipleFaces(count), 'warning');
      voiceInterview.sendProctoringEvent('multiple_faces', `Detected ${count} faces`);
    },
    onLookingAway: (direction) => {
      showToast(MESSAGES.interview.lookingAway(direction), 'warning');
      voiceInterview.sendProctoringEvent('looking_away', `Looking ${direction}`);
    },
  });

  /**
   * A second watcher on the paired phone's wide shot.
   *
   * <p>Its own instance rather than re-pointing the one above: both cameras
   * need watching at the same time, and they are looking for different things.
   * face-api caches its models and the dynamic import is module-scoped, so the
   * second instance costs a detection loop, not a second model download.</p>
   *
   * <p>Only {@code onMultipleFaces} is wired. "No face" and "looking away" are
   * meaningless on a room angle — the phone is often side-on and may not see
   * the candidate's face at all — and firing them would bury the one signal
   * that matters in noise the candidate cannot act on.</p>
   *
   * <p>{@code maxWarnings} is effectively infinite, so this can never end an
   * interview. That is by construction rather than by configuration: a room
   * angle picks up far more innocent movement than a face-on camera, and the
   * decision about what it saw belongs to a reviewer.</p>
   */
  const roomWatch = useFaceDetection({
    maxWarnings: Number.MAX_SAFE_INTEGER,
    checkIntervalMs: PROCTORING_CONFIG.mobileCompanion.roomWatch.checkIntervalMs,
    multipleFacesConsecutiveFrames: 2,
    onMultipleFaces: (count) => {
      showToast(MESSAGES.interview.roomSecondPerson(count), 'warning');
      // A distinct type from the laptop camera's `multiple_faces`: a reviewer
      // reading the log needs to know which camera saw it, because a second
      // person in the wide shot and one leaning into the laptop frame are
      // different situations.
      voiceInterview.sendProctoringEvent(
        'room_multiple_faces',
        `${count} people visible on the phone camera`
      );
    },
  });

  /**
   * Start watching the room once the phone is streaming and the interview is
   * under way, and stop when either goes away.
   *
   * <p>Keyed on the stream rather than started alongside the laptop camera:
   * the phone can pair before or after the interview begins, and a detector
   * pointed at a video element with no source silently does nothing.</p>
   */
  useEffect(() => {
    if (!PROCTORING_CONFIG.mobileCompanion.roomWatch.enabled) return;
    if (voiceInterview.state !== 'active' && voiceInterview.state !== 'answering') return;
    if (!remoteStream || !mobileVideoRef.current) return;

    let cancelled = false;
    const element = mobileVideoRef.current;
    roomWatch.loadModels().then(() => {
      if (!cancelled) roomWatch.startDetection(element);
    });

    return () => {
      cancelled = true;
      roomWatch.stopDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStream, voiceInterview.state]);

  // DevTools detection
  const { detectionCount: devToolsCount } = useDevToolsDetection();
  const prevDevToolsRef = useRef<number>(0);
  useEffect(() => {
    const prev = prevDevToolsRef.current;
    if (devToolsCount > prev) {
      showToast(MESSAGES.interview.devtoolsDetected, 'warning');
      if (!voiceInterview.isWsConnected) {
        showToast(MESSAGES.interview.devtoolsQueued, 'info');
      }
      voiceInterview.sendProctoringEvent('devtools', 'DevTools detected');
    }
    prevDevToolsRef.current = devToolsCount;
  }, [devToolsCount, showToast, voiceInterview]);

  // Pre-check permissions
  useEffect(() => {
    async function checkPermissions() {
      try {
        const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setMicPermission(micResult.state);
        micResult.onchange = () => setMicPermission(micResult.state);
      } catch {
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

  // Instruction countdown
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
  }, [voiceInterview.state, instructionCountdown]);

  // Audio narration of instructions
  const instructionAudioFiredRef = useRef(false);
  useEffect(() => {
    if (voiceInterview.state !== 'pre-start') return;
    const timerId = window.setTimeout(() => {
      if (instructionAudioFiredRef.current) return;
      instructionAudioFiredRef.current = true;
      const script = 'Please read the instructions carefully before starting the interview process. ...';
      speakInstruction(script, { rate: 0.95 });
    }, 500);
    return () => {
      clearTimeout(timerId);
      instructionAudioFiredRef.current = false;
      stopInstruction();
    };
  }, [voiceInterview.state, speakInstruction, stopInstruction]);

  const toggleInstructionAudio = useCallback(() => {
    if (isAudioMuted) {
      setIsAudioMuted(false);
    } else {
      stopInstruction();
      setIsAudioMuted(true);
    }
  }, [isAudioMuted, stopInstruction]);

  // WebSocket error callback
  useEffect(() => {
    const cb = (err: string) => {
      showToast(MESSAGES.interview.wsError(String(err)), 'error');
    };
    interviewWsService.setErrorCallback(cb);
    return () => interviewWsService.setErrorCallback(null);
  }, [showToast]);

  // Fallback fetch interview
  useEffect(() => {
    if (!interview && user?.email) {
      setLoadingInterview(true);
      interviewService
        .getActiveInterviews(user.email)
        .then((res) => {
          const active = (res.data ?? []).find(
            (i: InterviewSchedule) =>
              i.attemptStatus === 'NOT_ATTEMPTED' || i.attemptStatus === 'IN_PROGRESS'
          );
          if (active) setInterview(active);
        })
        .catch(() => { })
        .finally(() => setLoadingInterview(false));
    }
  }, [interview, user?.email]);

  const totalWarnings = faceWarnings + fullscreenExitCount + devToolsCount;

  /**
   * Whether the camera is opened at all once the interview starts.
   *
   * Three unrelated things want it — the recording kept as evidence, the frames
   * the face check reads, and the plain rule that it be on — and any one of
   * them is reason enough. Where none of them is switched on the candidate is
   * never prompted for their camera, which is what "skip" has to mean if it is
   * to mean anything.
   */
  const cameraStreamWanted =
    PROCTORING_CONFIG.recording.camera.required ||
    PROCTORING_CONFIG.eyeDetection.enabled ||
    PROCTORING_CONFIG.camera.required;

  // Post-completion flow
  //
  // The submission is complete the moment the interview ends. Recordings are
  // handed to the background uploader (see recording-sync.service) and the
  // candidate is released at once: what is left to upload does not depend on
  // this page, a closed tab, or the candidate waiting. Anything not yet
  // uploaded is kept in the browser and sent the next time the app opens.
  const runPostCompletionFlow = useCallback(
    async (skipEndCall: boolean) => {
      if (postCompletionStartedRef.current) return;
      postCompletionStartedRef.current = true;
      setShowEndConfirm(false);
      try {
        setPostCompletionStep('ending');
        if (!skipEndCall) {
          await voiceInterview.endInterview();
        }
        stopDetection();

        // Closing each recorder hands its last part to the uploader. Neither
        // call waits for an upload — they only wait for the recorder to stop.
        // Separate try blocks so one failing cannot cost the other.
        if (PROCTORING_CONFIG.recording.screen.required) {
          try {
            await stopScreenAndGetSegments();
          } catch (err) {
            console.error('Screen recording could not be finalised:', err);
          }
        }
        try {
          // Called either way: it is what releases the camera.
          await stopVideoAndGetBlob();
        } catch (err) {
          console.error('Camera recording could not be finalised:', err);
        }

        // Tell the paired phone to switch its camera off. Without this it
        // kept filming an interview that had finished, and the candidate was
        // left holding a page that still said "Live Proctoring".
        if (mobileToken) {
          try {
            interviewWsService.send(`/app/mobile/ended/${mobileToken}`, { status: 'ended' });
          } catch {
            // The socket may already be closing. The phone releases the camera
            // when the page closes anyway; this is the tidy path, not the only
            // one.
          }
        }

        setPostCompletionStep('done');
        setTimeout(() => {
          navigate(ROUTES.CANDIDATE.INTERVIEWS);
        }, 1500);
      } catch (err) {
        console.error('Post-completion flow error:', err);
        navigate(ROUTES.CANDIDATE.INTERVIEWS);
      }
    },
    [
      voiceInterview,
      stopScreenAndGetSegments,
      stopVideoAndGetBlob,
      stopDetection,
      navigate,
      mobileToken,
    ]
  );

  useEffect(() => {
    runPostCompletionFlowRef.current = runPostCompletionFlow;
  }, [runPostCompletionFlow]);

  // Inactivity timers
  const clearInactivityTimers = useCallback(() => {
    if (inactivityWarningRef.current) clearTimeout(inactivityWarningRef.current);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    inactivityWarningShownRef.current = false;
  }, []);
  const startInactivityTimers = useCallback(() => {
    clearInactivityTimers();
    inactivityWarningRef.current = window.setTimeout(() => {
      inactivityWarningShownRef.current = true;
      showToast(MESSAGES.interview.inactivityWarning, 'warning');
    }, APP_CONFIG.INTERVIEW_INACTIVITY_WARNING_SECONDS * 1000);
    inactivityTimeoutRef.current = window.setTimeout(() => {
      // Asks, rather than ends. Silence is not evidence of abandonment — a
      // candidate reading a question or writing code makes no sound at all,
      // and this used to end their interview after three minutes of it. An
      // interview now finishes only on a proctoring violation, on running out
      // of time, or because the candidate said they were done.
      setStillThereOpen(true);
    }, APP_CONFIG.INTERVIEW_INACTIVITY_TIMEOUT_SECONDS * 1000);
  }, [clearInactivityTimers, showToast]);

  useEffect(() => {
    // Restarted on every keystroke in the editor, because the code length is a
    // dependency: someone typing is plainly still present, and the check exists
    // to notice an empty chair.
    if (voiceInterview.state === 'active' && !voiceInterview.isPlaying) {
      startInactivityTimers();
    } else {
      clearInactivityTimers();
    }
    return () => clearInactivityTimers();
  }, [
    voiceInterview.state,
    voiceInterview.isPlaying,
    voiceInterview.codeContent.length,
    startInactivityTimers,
    clearInactivityTimers,
  ]);

  // Answer timer
  const submitAnswerRef = useRef(voiceInterview.submitAnswer);
  submitAnswerRef.current = voiceInterview.submitAnswer;
  useEffect(() => {
    if (voiceInterview.state === 'answering') {
      setAnswerSecondsLeft(APP_CONFIG.INTERVIEW_ANSWER_TIMEOUT_SECONDS);
      answerTimerRef.current = window.setInterval(() => {
        setAnswerSecondsLeft((prev) => {
          if (prev <= 1) {
            if (answerTimerRef.current) clearInterval(answerTimerRef.current);
            showToast(MESSAGES.interview.answerTimeLimit, 'warning');
            submitAnswerRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    }
    return () => { if (answerTimerRef.current) clearInterval(answerTimerRef.current); };
  }, [voiceInterview.state, showToast]);

  useEffect(() => {
    if (voiceInterview.state === 'answering') {
      questionTimer.resetSkipCounter();
    }
  }, [voiceInterview.state, questionTimer]);

  /**
   * Warnings are told to the candidate once, and never end the interview.
   *
   * <p>This used to call {@code runPostCompletionFlow} and submit the
   * interview. It only looked harmless because the ceiling it compared
   * against was 999999 — while the server was ending the interview at five,
   * marking it FAILED with PROCTORING_VIOLATION. Neither side should be
   * making that call: the warnings are recorded against the interview and a
   * person decides what they are worth.</p>
   *
   * <p>The toast fires once rather than on every warning past the mark; a
   * candidate being told the same thing every few seconds cannot concentrate
   * on the question they are being asked.</p>
   */
  const warnedAboutProctoringRef = useRef(false);
  useEffect(() => {
    if (voiceInterview.state === 'pre-start' || voiceInterview.state === 'completed') return;
    if (totalWarnings < APP_CONFIG.INTERVIEW_PROCTORING_WARNING_NOTICE) return;
    if (warnedAboutProctoringRef.current) return;
    warnedAboutProctoringRef.current = true;
    showToast(MESSAGES.interview.maxWarnings, 'warning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalWarnings, voiceInterview.state]);

  // Compile handler
  const handleCompile = async () => {
    if (!voiceInterview.codeContent.trim()) {
      showToast(MESSAGES.interview.writeCodeFirst, 'warning');
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
      // Also held on the interview state, so it is submitted with the answer
      // rather than staying on this screen.
      voiceInterview.setCodeOutput(output);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const failure = 'Compilation failed: ' + (err.response?.data?.message || err.message);
      setCompileOutput(failure);
      // A failed compile is evidence too — the interviewer should see that the
      // submitted code does not build.
      voiceInterview.setCodeOutput(failure);
    } finally {
      setCompiling(false);
    }
  };

  // Clear compile output when new question arrives
  useEffect(() => {
    setCompileOutput('');
  }, [voiceInterview.conversation.length, voiceInterview.isCodingQuestion]);

  // Video preview
  useEffect(() => {
    if (videoRef.current && recorderStream) {
      videoRef.current.srcObject = recorderStream;
    }
  }, [recorderStream]);

  // Screen-share preview. Cleared as well as set: a stopped share otherwise
  // leaves its last frame on screen, which reads as though it were still live.
  useEffect(() => {
    const element = screenPreviewRef.current;
    if (!element) return;
    element.srcObject = screenStream;
  }, [screenStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoRecording();
      stopScreenRecording();
      stopDetection();
      clearInactivityTimers();
      if (answerTimerRef.current) clearInterval(answerTimerRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (peerConnectionRef.current) peerConnectionRef.current.close();
    };
  }, []);

  /**
   * Keep the newest turn in view.
   *
   * <p>Scrolling the chat box alone was not enough. Once the code editor is
   * open the chat is squeezed to a few lines and the column around it is what
   * actually scrolls, so a new question arrived below the fold of the column
   * and the candidate was looking at an editor for a question they could not
   * read. With the editor open the column is scrolled to the question pinned
   * above it rather than to the bottom — the bottom is the Compile and Submit
   * row, which puts the question off-screen again.</p>
   */
  useEffect(() => {
    const chat = chatContainerRef.current;
    if (chat) chat.scrollTop = chat.scrollHeight;

    const column = columnRef.current;
    if (!column) return;
    const coding = codingSectionRef.current;
    if (coding) {
      column.scrollTo({ top: Math.max(0, coding.offsetTop - 8), behavior: 'smooth' });
    } else {
      column.scrollTop = column.scrollHeight;
    }
  }, [voiceInterview.conversation, voiceInterview.streamingText]);

  /**
   * Bring the editor into view the moment a coding task opens it.
   *
   * <p>It is appended under the transcript, below the fold on every screen
   * short of a desktop: the interviewer said "write a function" and nothing
   * visible changed.</p>
   */
  useEffect(() => {
    if (!voiceInterview.isCodingQuestion) return;
    const id = window.setTimeout(() => {
      const column = columnRef.current;
      const coding = codingSectionRef.current;
      if (column && coding) {
        column.scrollTo({ top: Math.max(0, coding.offsetTop - 8), behavior: 'smooth' });
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [voiceInterview.isCodingQuestion]);

  // Natural completion detection
  useEffect(() => {
    if (voiceInterview.state === 'completed' && !postCompletionStartedRef.current) {
      runPostCompletionFlow(true);
    }
  }, [voiceInterview.state, runPostCompletionFlow]);

  // ---------- Mobile Companion Integration ----------
  // Generate token when interview is ready (before start)
  useEffect(() => {
    if (interview && !mobileToken) {
      setMobileToken(uuidv4());
    }
  }, [interview, mobileToken]);

  /**
   * Show the phone step as soon as there is a token to encode.
   *
   * It used to appear only after the candidate pressed Start once, so the first
   * press never started anything — and a candidate who had read the rules,
   * taken their photo and scanned their room met a QR code they had not been
   * told to expect, on a screen that had just refused to begin. The step is now
   * one of the things they work through, and Start means start.
   */
  useEffect(() => {
    if (mobileToken) setIsSetupActive(true);
  }, [mobileToken]);

  // 2. Connect WebSocket and register desktop
  useEffect(() => {
    const token = mobileToken;
    if (!token) return;

    interviewWsService.connect({
      mobileToken: token,
      onConnect: () => {
        console.log('Desktop WS connected with mobileToken');
        setWsConnected(true);
        interviewWsService.send('/app/desktop/register', { token });
      },
      onDisconnect: () => {
        console.log('Desktop WebSocket disconnected');
        setWsConnected(false);
      },
    });

    return () => {
      interviewWsService.disconnect();
    };
  }, [mobileToken]);

  // 3. WebRTC peer connection (only ONE)
  useEffect(() => {
    const token = mobileToken;
    if (!token) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      console.log('Mobile track received', event.track.kind, event.streams[0]);
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setMobileConnected(true);
      }
      // Tracked separately because the stream object is the same one on both
      // the video and the audio track's arrival — React sees no change, so
      // reading getAudioTracks() off it during render would never update.
      if (event.track.kind === 'audio') {
        setMobileAudioAvailable(true);
        event.track.addEventListener('ended', () => setMobileAudioAvailable(false));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Desktop sending ICE candidate to mobile');
        interviewWsService.send('/app/mobile/ice/' + token, { candidate: event.candidate, target: 'mobile' });
      }
    };

    return () => {
      pc.close();
    };
  }, [mobileToken]);

  // 4. Subscriptions for Mobile
  useEffect(() => {
    const token = mobileToken;
    const pc = peerConnectionRef.current;
    const isReady = token && pc && (wsConnected || voiceInterview.isWsConnected);

    if (!isReady) return;

    console.log('Setting up/refreshing mobile signaling subscriptions on desktop. WS Connected:', { local: wsConnected, global: voiceInterview.isWsConnected });

    const handleOffer = (offer: RTCSessionDescriptionInit) => {
      console.log('Received WebRTC offer from mobile', offer);
      pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
          console.log('Sending WebRTC answer to mobile');
          interviewWsService.send('/app/mobile/answer/' + token, pc.localDescription);
        })
        .catch(err => console.error('Error handling WebRTC offer:', err));
    };
    const handleIce = (data: { candidate: RTCIceCandidateInit; target: string }) => {
      if (data.target === 'desktop' && data.candidate) {
        console.log('Adding ICE candidate from mobile');
        pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch(err => console.error('Error adding ICE candidate:', err));
      }
    };

    const handleReady = () => {
      console.log('Mobile device reported ready');
      setMobileConnected(true);
    };
    const handleVerified = () => {
      setMobileVerified(true);
      showToast(MESSAGES.interview.mobileVerified, 'success');
    };
    const handleWarning = (warning: { type: string; reason: string }) => {
      showToast(MESSAGES.interview.proctoringWarning(warning.reason), 'error');
      voiceInterview.sendProctoringEvent('mobile_malpractice', warning.reason);
    };

    interviewWsService.subscribe('/user/queue/mobile/offer', handleOffer);
    interviewWsService.subscribe('/user/queue/mobile/ice', handleIce);
    interviewWsService.subscribe('/user/queue/mobile/ready', handleReady);
    interviewWsService.subscribe('/user/queue/mobile/verified', handleVerified);
    interviewWsService.subscribe('/user/queue/mobile/warning', handleWarning);

    // Re-register desktop to the token-session map on backend
    interviewWsService.send('/app/desktop/register', { token });

    // Signal to mobile that we are ready to receive stream
    const timeout = setTimeout(() => {
      console.log('Sending ready signal to mobile');
      interviewWsService.send('/app/mobile/ready/' + token, { status: 'ready' });
    }, 1000);

    return () => {
      clearTimeout(timeout);
      interviewWsService.unsubscribe('/user/queue/mobile/offer');
      interviewWsService.unsubscribe('/user/queue/mobile/ice');
      interviewWsService.unsubscribe('/user/queue/mobile/ready');
      interviewWsService.unsubscribe('/user/queue/mobile/verified');
      interviewWsService.unsubscribe('/user/queue/mobile/warning');
    };
  }, [mobileToken, wsConnected, voiceInterview.isWsConnected]);

  /**
   * Point the recorder at whichever microphone the candidate picked.
   *
   * Also the recovery path: if the phone drops mid-interview,
   * `mobileAudioAvailable` goes false and this hands the recorder back to the
   * device microphone before the next answer, rather than letting them speak
   * into a track that has ended.
   */
  useEffect(() => {
    const usePhone = micSource === 'phone' && mobileAudioAvailable && remoteStream;
    voiceInterview.setExternalAudioSource(usePhone ? remoteStream : null);
  }, [micSource, mobileAudioAvailable, remoteStream, voiceInterview.setExternalAudioSource]);

  // Effect to attach mobile stream when connected and video ref is available
  useEffect(() => {
    if (remoteStream && mobileVideoRef.current) {
      console.log('Attaching mobile stream to video element');
      mobileVideoRef.current.srcObject = remoteStream;

      // Ensure the video plays
      mobileVideoRef.current.play().catch(err => {
        console.warn('Auto-play failed for mobile video:', err);
      });
    }
  }, [remoteStream, mobileConnected]);

  const getMobileBaseUrl = () => {
    // Use environment variable or fallback to window.location.origin (for desktop)
    const localIp = import.meta.env.VITE_LOCAL_IP;
    if (localIp) {
      return `http://${localIp}:5173`;
    }
    return window.location.origin;
  };

  // Start interview handler
  const handleStartInterview = async () => {
    if (!interview || !user?.email) return;

    if (!mobileVerified) {
      // Where pairing is required, this is a wall rather than a prompt —
      // otherwise the second camera is only ever advisory and an interview can
      // be sat with the step skipped and nothing recording that it was.
      if (PROCTORING_CONFIG.mobileCompanion.required) {
        showToast(MESSAGES.interview.mobileRequired, 'warning');
        return;
      }
      // The waiver has to have been ticked. The pre-start screen keeps the
      // button shut until it is, and this is the same rule stated where the
      // interview actually begins.
      if (!mobileSkipped) {
        showToast(MESSAGES.interview.mobileSkipNotConfirmed, 'warning');
        return;
      }
      setMobileVerified(true);
      showToast(MESSAGES.interview.proceedingWithoutRoom, 'info');
    }

    if (wsConnected) {
      interviewWsService.disconnect(); // disconnect mobile pairing WS
    }

    stopInstruction();
    try {
      if (PROCTORING_CONFIG.fullscreen.enabled) await enterFullscreen();
      // The models are a multi-megabyte download; fetching them for a check
      // that is switched off spends the candidate's bandwidth on nothing.
      if (PROCTORING_CONFIG.eyeDetection.enabled) await loadModels();
      const started = await voiceInterview.startInterview({
        email: user.email,
        jobPrefix: interview.jobPrefix,
        // The interview this screen is showing. Without it the server picked
        // the most recently assigned one, so a candidate with a repeat L2 and
        // an L3 outstanding could start the round they had not chosen.
        scheduleId: interview.id,
        mobileToken: mobileToken || undefined,
      });
      // Said out loud, because the candidate's own read on a reload is that
      // they have lost the interview. The transcript reappearing behind the
      // toast is the proof, but the reassurance should not depend on them
      // noticing it.
      if (started?.resumed) {
        showToast(MESSAGES.interview.resumed, 'info');
      }
      // The recording audit, from the first moment. Says what this deployment
      // requires, so a reviewer who finds no recording can tell "it was
      // switched off" from "it was required and did not happen" — the two
      // look identical on the results page otherwise.
      voiceInterview.sendProctoringEvent(
        'recording_policy',
        `Camera recording: ${PROCTORING_CONFIG.recording.camera.required ? 'required' : 'not required (switched off by configuration)'}. ` +
          `Screen recording: ${PROCTORING_CONFIG.recording.screen.required ? 'required' : 'not required (switched off by configuration)'}.`,
      );

      // The camera is opened when anything wants it: the recording, the face
      // check, or the plain requirement that it be on. Where nothing does, the
      // candidate is not prompted for it at all.
      if (cameraStreamWanted) {
        try {
          // Asked for explicitly rather than left to the browser, which
          // picks up to 720p30 — a resolution nothing here needs and every
          // byte of which has to be uploaded over a candidate's own
          // connection. `ideal` rather than `exact`: a webcam that cannot
          // offer this should still record at whatever it has, not refuse.
          const mediaStream = await startVideoRecording({
            audio: true,
            video: {
              width: { ideal: PROCTORING_CONFIG.recording.camera.width },
              height: { ideal: PROCTORING_CONFIG.recording.camera.height },
              frameRate: { ideal: PROCTORING_CONFIG.recording.camera.frameRate },
            },
          });
          if (videoRef.current && mediaStream) {
            videoRef.current.srcObject = mediaStream;
            if (PROCTORING_CONFIG.eyeDetection.enabled) startDetection(videoRef.current);
          }
          if (PROCTORING_CONFIG.recording.camera.required) {
            voiceInterview.sendProctoringEvent('camera_recording_started', 'Camera recording started');
          }
        } catch (err) {
          showToast(MESSAGES.interview.videoRecordFailed, 'warning');
          if (PROCTORING_CONFIG.recording.camera.required) {
            const why = err instanceof DOMException ? `${err.name}: ${err.message}` : String(err);
            voiceInterview.sendProctoringEvent(
              'camera_recording_not_started',
              `Camera recording is required but could not start (${why})`,
            );
          }
        }
      }
      if (PROCTORING_CONFIG.recording.screen.required) {
        try {
          await startScreenRecording();
          setScreenPermission('granted');
          voiceInterview.sendProctoringEvent('screen_recording_started', 'Screen recording started');
        } catch (err) {
          setScreenPermission('denied');
          const why = err instanceof DOMException ? ` (${err.name})` : '';
          voiceInterview.sendProctoringEvent(
            'screen_share_denied',
            `Screen recording is required but permission was denied${why}`,
          );
        }
      }
      // Started only now that capture is under way (a failed camera or screen
      // is caught above, so it cannot skip this). It used to start first, and
      // a deadline already in the past (the candidate coming back after the
      // server had timed the interview out) expired it before either recorder
      // existed — ending the interview with "nothing was captured" for both.
      // Anchored to the server's deadline where it sends one. The clock used
      // to be a fresh countdown of the configured length, so a reload handed
      // the candidate another full interview — and a backgrounded tab or a
      // closed laptop made it run slow, because a throttled interval simply
      // stops counting. parseServerInstant reads a bare stamp as UTC; a
      // deadline that has already passed expires immediately, which is the
      // honest answer rather than time the server will not honour.
      const deadline = started?.expiresAt ? parseServerInstant(started.expiresAt) : null;
      if (deadline && !Number.isNaN(deadline.getTime())) {
        startGlobalTimerAt(deadline.getTime());
      } else {
        startGlobalTimer();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper functions
  const getWarningColor = () => {
    if (totalWarnings >= 4) return 'text-red-500';
    if (totalWarnings >= 2) return 'text-amber-500';
    return 'text-emerald-500';
  };
  const getStepStatus = (step: 'ending' | 'uploading-screen') => {
    const order: PostCompletionStep[] = ['ending', 'uploading-screen', 'done'];
    const currentIdx = order.indexOf(postCompletionStep);
    const stepIdx = order.indexOf(step);
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
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

  const isCountdownActive = instructionCountdown > 0;
  const canStartInterview = !isCountdownActive && micPermission !== 'denied';

  // Pre-start screen with QR code.
  //
  // 'error' belongs here too. It used to fall through to the main interview
  // screen, which then rendered an empty transcript, "Q: 0" and a permanent
  // "Connection lost. Reconnecting..." banner — so a start that failed on the
  // server (a job with no interview questions uploaded, say) looked to the
  // candidate like their internet had dropped. Back on this screen the server's
  // own message is shown and Start can be pressed again.
  if (
    voiceInterview.state === 'pre-start' ||
    voiceInterview.state === 'starting' ||
    voiceInterview.state === 'error'
  ) {
    return (
      <InterviewPreStartScreen
        jobPrefix={interview.jobPrefix}
        isSetupActive={isSetupActive}
        mobileConnected={mobileConnected}
        mobileVerified={mobileVerified}
        mobileConnectUrl={`${getMobileBaseUrl()}/mobile-connect?token=${mobileToken}`}
        mobileStream={remoteStream}
        isSpeaking={isSpeaking}
        isAudioMuted={isAudioMuted}
        onToggleAudio={toggleInstructionAudio}
        isCountdownActive={isCountdownActive}
        instructionCountdown={instructionCountdown}
        micPermission={micPermission}
        cameraPermission={cameraPermission}
        mobileRequired={PROCTORING_CONFIG.mobileCompanion.required}
        mobileSkipped={mobileSkipped}
        onMobileSkippedChange={setMobileSkipped}
        error={voiceInterview.error ?? undefined}
        starting={voiceInterview.state === 'starting'}
        canStartInterview={canStartInterview}
        onStart={handleStartInterview}
        scheduleId={interview.id}
        candidateEmail={user?.email ?? ''}
        capturesReady={capturesReady}
        onCapturesReadyChange={setCapturesReady}
      />
    );
  }


  // Main interview screen
  return (
    // Locked to the viewport on a desktop, where the transcript and the sidebar
    // each scroll in their own right. Below that breakpoint the two stack and
    // the page scrolls as one — `h-screen overflow-hidden` there simply cut the
    // sidebar, and with it the camera preview and the warning count, off the
    // bottom of the screen with no way to reach them.
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[var(--background)] flex flex-col">
      {/* Disconnect banner.
          Gated on hasEverConnected: before the socket has connected once there
          is nothing to have lost, and saying otherwise sent candidates chasing
          their wifi over a server-side failure. */}
      {voiceInterview.hasEverConnected && !voiceInterview.isWsConnected
        && voiceInterview.state !== 'completed' && !postCompletionStep && (
        <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-50">
          <WifiOff size={16} />
          {/* From state, not the service field: that was read during render and
              so never updated as attempts climbed. */}
          <span>Connection lost. Reconnecting... (attempt {voiceInterview.reconnectAttempts})</span>
          <Loader2 size={14} className="animate-spin" />
        </div>
      )}

      {/* "Still there?" — shown after a long silence, and only ever asking.
          Dismissing it restarts the check; nothing here ends the interview. */}
      <Modal
        isOpen={stillThereOpen}
        onClose={() => setStillThereOpen(false)}
        title="Are you still there?"
        size="sm"
        footer={
          <Button
            onClick={() => {
              setStillThereOpen(false);
              startInactivityTimers();
            }}
          >
            Yes, I&apos;m still here
          </Button>
        }
      >
        <p className="text-sm text-[var(--textSecondary)]">
          We have not heard anything for a few minutes. Your interview is still running and nothing
          has been submitted — carry on when you are ready.
        </p>
      </Modal>

      {/* The rules, on demand and in the same shape the instructions used.
          contained={false} because the interview runs fullscreen with no app
          chrome to keep clear of — contained would offset it against a sidebar
          that is not there. */}
      <Modal
        isOpen={showRules}
        onClose={() => setShowRules(false)}
        title="Interview Rules"
        size="lg"
        contained={false}
        footer={<Button onClick={() => setShowRules(false)}>Back to interview</Button>}
      >
        <ul className="space-y-3">
          {buildProctoringRules().map((rule) => (
            <li key={rule.text} className="flex items-start gap-3">
              <span className="mt-0.5 flex-shrink-0 text-[var(--primary)]">{rule.icon}</span>
              <span className="text-sm text-[var(--text)]">{rule.text}</span>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Post-completion overlay */}
      {postCompletionStep && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[var(--cardBg)] rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            {/* The submission, stated first and on its own. It is complete the
                moment the interview ends and does not depend on anything
                below — a candidate watching an upload bar had no way to know
                their answers were already safely in, and a failed upload read
                as a failed interview. */}
            <div className="text-center">
              {getStepStatus('ending') === 'done' ? (
                <>
                  <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-500" />
                  <h2 className="text-xl font-bold text-[var(--text)]">Interview submitted</h2>
                  <p className="mt-1 text-sm text-[var(--textSecondary)]">
                    Your answers are saved. Nothing below can change that.
                  </p>
                </>
              ) : (
                <>
                  <Loader2 size={36} className="mx-auto mb-2 animate-spin text-blue-500" />
                  <h2 className="text-xl font-bold text-[var(--text)]">Submitting your interview…</h2>
                </>
              )}
            </div>

            {/* Said once and plainly. The recordings are not the candidate's
                to wait on: they upload in the background and, if the tab is
                closed first, are finished the next time the app is opened. */}
            {getStepStatus('ending') === 'done' && (
              <p className="rounded-xl bg-[var(--surface1)] p-3 text-center text-xs text-[var(--textSecondary)]">
                Your recording is being saved in the background. You do not need to wait for it.
              </p>
            )}

            {postCompletionStep === 'done' && (
              <p className="text-center text-sm font-medium text-emerald-500">Taking you back…</p>
            )}
          </div>
        </div>
      )}

      {/* Early end confirmation */}
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

      {/* Fullscreen enforcement. Gated on the switch: with fullscreen disabled
          the interview never asks for it, so this overlay sat over the whole
          screen from the first frame with a button that put the candidate into
          a mode the deployment had turned off. */}
      {PROCTORING_CONFIG.fullscreen.enabled && !isFullscreen
        && voiceInterview.state !== 'completed' && !postCompletionStep && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[var(--cardBg)] rounded-2xl p-6 sm:p-8 w-full max-w-md text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Maximize className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">Fullscreen Required</h2>
            <p className="text-sm text-[var(--textSecondary)]">Please return to fullscreen to continue.</p>
            <Button onClick={enterFullscreen} size="lg">Return to Fullscreen</Button>
          </div>
        </div>
      )}


      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[var(--cardBg)] border-b border-[var(--border)] px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 max-w-7xl mx-auto">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Badge variant="info">Voice Interview</Badge>
            <span className="truncate text-sm text-[var(--textSecondary)]">{interview.jobPrefix}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
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
            <div className="flex items-center gap-1">
              {voiceInterview.isWsConnected ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
            </div>
            <span className="text-xs text-[var(--textSecondary)]">Q: {voiceInterview.questionsAsked}</span>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${globalSecondsLeft <= 300 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-[var(--surface1)] text-[var(--text)]'}`}>
              {/* Counts up from 0:00, as the L2 and L3 rounds are run. The
                  deadline underneath is still a countdown to the server's
                  expiry — only what is shown is elapsed time, and the red
                  warning still means five minutes remain. */}
              <Clock size={16} /> {formatTimer(elapsedSeconds)}
            </div>
            {/* The warning pill and its breakdown, as the exam shows them —
                and, like the exam's, listing only the checks that are actually
                switched on. A counter for a check that never runs reads as a
                score the candidate cannot affect. */}
            <div className="relative group">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface1)] cursor-default ${getWarningColor()}`}>
                {/* A count, not a countdown. It read "2/999999", which is
                    both meaningless and — while the server still terminated
                    at five — actively misleading. */}
                <Shield size={14} /> <span className="text-xs font-semibold">{totalWarnings}</span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--cardBg)] rounded-lg shadow-lg border border-[var(--border)] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30">
                <p className="text-xs font-semibold text-[var(--text)] mb-2">Warning Breakdown</p>
                <div className="space-y-1.5 text-xs text-[var(--textSecondary)]">
                  {PROCTORING_CONFIG.eyeDetection.enabled && (
                    <div className="flex justify-between"><span>Face / eye</span><span className="font-mono">{faceWarnings}</span></div>
                  )}
                  {PROCTORING_CONFIG.fullscreen.enabled && (
                    <div className="flex justify-between"><span>Fullscreen exits</span><span className="font-mono">{fullscreenExitCount}</span></div>
                  )}
                  <div className="flex justify-between"><span>DevTools</span><span className="font-mono">{devToolsCount}</span></div>
                </div>
                <p className="mt-2 text-[11px] text-[var(--textSecondary)] border-t border-[var(--border)] pt-2">
                  These are noted for the reviewer. They do not end your interview and they are
                  not a score. Avoid reloading — if you do, reopen the interview and it picks up
                  where you left off.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRules(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[var(--surface1)] text-[var(--textSecondary)] hover:bg-[var(--surface2)] hover:text-[var(--text)] text-sm font-medium transition-colors"
              title="Interview rules"
            >
              <BookOpen size={14} /> <span className="hidden sm:inline">Rules</span>
            </button>
            <button onClick={() => setShowEndConfirm(true)} disabled={!!postCompletionStep} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
              <LogOut size={14} /> End
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full min-h-0">
        {/* Left Column. min-w-0 so a long transcript line or a wide code editor
            shrinks the column rather than pushing the sidebar off-screen — a
            flex child defaults to min-width:auto, which is what let the editor
            overlap the sidebar at narrow widths. */}
        {/* The column scrolls as a whole. It used to be a fixed-height flex
            column inside `lg:overflow-hidden`: once the code editor was open,
            the avatar, the editor and the controls together came to more than
            the viewport, and the mic controls were simply clipped off the
            bottom with no way to scroll to them. Now anything that does not
            fit scrolls, and the two things that must always be reachable —
            who is speaking, and the mic — are pinned to the top and bottom. */}
        <div ref={columnRef} className="relative flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
          {/* Presence strip. Compact and horizontal: the old centred avatar
              block cost ~10rem of height that the editor needed. */}
          <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-2.5 backdrop-blur-md">
            <AIAvatar
              isSpeaking={voiceInterview.isPlaying}
              isListening={voiceInterview.isRecording}
              isThinking={voiceInterview.state === 'processing'}
              amplitude={voiceInterview.amplitude}
              size="sm"
              layout="inline"
            />
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--textTertiary)]">
                Interviewer
              </p>
              <p className="truncate text-sm font-semibold text-[var(--text)]">
                {voiceInterview.interviewerName}
              </p>
            </div>
          </div>

          {/* Conversation area */}
          <div
            ref={chatContainerRef}
            className="flex-1 min-h-[12rem] overflow-y-auto p-4 sm:p-6 space-y-4"
          >
            {voiceInterview.conversation.map((entry, idx) => (
              <div key={idx} className={`flex items-start gap-3 ${entry.role === 'candidate' ? 'flex-row-reverse' : ''} ${entry.role === 'filler' ? 'opacity-60' : ''}`}>
                {entry.role !== 'filler' && entry.role !== 'system' && (
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.role === 'interviewer' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                    {entry.role === 'interviewer' ? <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <User className="w-4 h-4 text-green-600 dark:text-green-400" />}
                  </div>
                )}
                <div className={`max-w-[85%] sm:max-w-[70%] min-w-0 break-words p-3 sm:p-4 rounded-lg ${entry.role === 'interviewer' ? 'bg-[var(--surface1)] text-[var(--text)]' : entry.role === 'candidate' ? 'bg-[var(--primary)] text-white' : entry.role === 'system' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm border border-amber-200 dark:border-amber-800' : 'bg-transparent text-[var(--textTertiary)] italic text-sm p-2'} ${entry.isStreaming ? 'border border-blue-300 dark:border-blue-700' : ''}`}>
                  <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                  {entry.role !== 'filler' && entry.role !== 'system' && <p className={`text-xs mt-2 ${entry.role === 'interviewer' ? 'text-[var(--textTertiary)]' : 'text-white/70'}`}>{new Date(entry.timestamp).toLocaleTimeString()}</p>}
                </div>
              </div>
            ))}
            {voiceInterview.state === 'processing' && !voiceInterview.streamingText && (
              <div className="flex items-center gap-2 text-[var(--textSecondary)]"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Processing your answer...</span></div>
            )}
            {voiceInterview.state === 'completed' && !postCompletionStep && (
              <div className="text-center py-4"><Badge variant="success" size="lg">Interview Complete</Badge><p className="text-sm text-[var(--textSecondary)] mt-2">Generating evaluation...</p></div>
            )}
          </div>

          {/* Coding Editor & Compile.
              No height cap of its own any more — the candidate sets the
              editor's height with its grip, and the column scrolls. Capping it
              at 55vh only meant a tall editor squeezed the transcript to
              nothing and pushed the controls off-screen. */}
          {voiceInterview.isCodingQuestion && voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div ref={codingSectionRef} className="flex-shrink-0 min-w-0 border-t border-[var(--border)] px-2 sm:px-4 py-2 sm:py-3 space-y-2">
              {/* The question, pinned above the editor. The chat scrolls, and
                  once the editor and its output are open the question that was
                  asked is usually off the top of it — leaving the candidate
                  writing code against something they can no longer read. It
                  scrolls inside its own box so a long one cannot push the
                  editor off the screen. */}
              {currentQuestion && (
                <details open className="rounded-lg border border-[var(--border)] bg-[var(--surface1)]">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--textSecondary)]">
                    The question
                  </summary>
                  <p className="max-h-24 sm:max-h-48 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-[var(--text)]">
                    {currentQuestion}
                  </p>
                </details>
              )}
              <CodingEditor code={voiceInterview.codeContent} language={voiceInterview.codeLanguage} onCodeChange={voiceInterview.setCodeContent} onLanguageChange={voiceInterview.setCodeLanguage} disabled={voiceInterview.state === 'processing'} />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={handleCompile} disabled={compiling || !voiceInterview.codeContent.trim()}>
                  {compiling ? <Loader2 size={14} className="animate-spin mr-2" /> : <Play size={14} className="mr-2" />}
                  Compile & Run
                </Button>
                {/* There was no way to submit code at all. The only route was
                    to speak and stop the mic, so a candidate who had written a
                    working solution and had nothing to say about it was stuck.
                    Any spoken explanation already recorded goes with it. */}
                <Button
                  size="sm"
                  onClick={() => voiceInterview.submitAnswer()}
                  disabled={
                    voiceInterview.state === 'processing' || !voiceInterview.codeContent.trim()
                  }
                  leftIcon={<Send size={14} />}
                >
                  Submit answer
                </Button>
              </div>
              {compileOutput && (
                <div className="mt-2 min-w-0 p-3 rounded-lg bg-[#1e1e1e] text-gray-200 font-mono text-xs sm:text-sm overflow-auto max-h-32 sm:max-h-48">
                  {/* break-words as well as wrap: a stack trace or a long
                      compiler path has no spaces to wrap at, and without it
                      the panel stretches the whole column wider than the
                      phone and the page scrolls sideways. */}
                  <pre className="whitespace-pre-wrap break-words">{compileOutput}</pre>
                </div>
              )}
            </div>
          )}

          {/* Voice controls. Pinned to the bottom of the scrolling column: the
              mic is the one control the candidate must always be able to reach,
              whatever else is open above it. */}
          {voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="sticky bottom-0 z-10 mt-auto flex-shrink-0 border-t border-[var(--border)] bg-[var(--cardBg)]/95 p-3 sm:p-4 backdrop-blur-md">
              {voiceInterview.transcriptionError && (
                <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">Speech not captured: {voiceInterview.transcriptionError}</span>
                </div>
              )}
              {/* Captions, shown for the whole time the mic is open — not only
                  once text arrives. An empty panel that says "listening" tells
                  the candidate their microphone is live and nothing has been
                  heard yet; rendering nothing at all told them neither, and a
                  candidate whose speech was not being captured had no way to
                  know before their answer was submitted empty. */}
              {voiceInterview.isRecording && (
                <div className="mb-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <p className="text-xs text-[var(--textTertiary)] mb-1">
                    Live captions — this is what gets sent to the interviewer
                  </p>
                  {voiceInterview.currentTranscript ? (
                    <p className="text-sm text-[var(--text)]">{voiceInterview.currentTranscript}</p>
                  ) : (
                    <p className="text-sm italic text-[var(--textTertiary)]">
                      Listening… your words will appear here as you speak.
                    </p>
                  )}
                </div>
              )}
              {voiceInterview.isRecording && (
                <div className="mb-3 flex items-center gap-2">
                  <Mic size={14} className="text-red-500" />
                  <div className="flex-1 h-2 bg-[var(--surface1)] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-75" style={{ width: `${voiceInterview.audioLevel ?? 0}%` }} />
                  </div>
                  <span className="text-xs text-[var(--textTertiary)] w-8 text-right">{voiceInterview.audioLevel ?? 0}%</span>
                </div>
              )}
              {questionTimer.isTimerActive && voiceInterview.state === 'active' && !voiceInterview.isPlaying && (
                <div className="mb-3 flex items-center justify-center gap-3">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${questionTimer.secondsLeft <= 10 ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : questionTimer.secondsLeft <= 20 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'}`}>
                    <Timer size={16} className={questionTimer.secondsLeft <= 10 ? 'text-red-500 animate-pulse' : questionTimer.secondsLeft <= 20 ? 'text-amber-500' : 'text-emerald-500'} />
                    <span className={`text-lg font-mono font-bold ${questionTimer.secondsLeft <= 10 ? 'text-red-600 dark:text-red-400' : questionTimer.secondsLeft <= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{questionTimer.secondsLeft}s</span>
                    <span className={`text-xs ${questionTimer.secondsLeft <= 10 ? 'text-red-500' : questionTimer.secondsLeft <= 20 ? 'text-amber-500' : 'text-emerald-500'}`}>to answer</span>
                  </div>
                  {questionTimer.consecutiveSkips > 0 && <span className="text-xs text-amber-500 font-medium">Skipped: {questionTimer.consecutiveSkips}/{APP_CONFIG.INTERVIEW_MAX_CONSECUTIVE_SKIPS}</span>}
                </div>
              )}
              {/* The control bar.
                  The mic was an unlabelled circle and the replay control a
                  44px grey one beside it, with the only explanation in 12px
                  tertiary text underneath and the rest in a title attribute no
                  touch device shows. A candidate mid-interview should not have
                  to work out which circle talks. Everything here is labelled,
                  big enough to hit, and sits on its own surface so it reads as
                  the place you act rather than more page. */}
              <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-xl sm:p-4 dark:bg-slate-950">
                {voiceInterview.state === 'active' && !voiceInterview.isPlaying && (
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
                    <button
                      onClick={() => { if (!voiceInterview.isWsConnected) showToast(MESSAGES.interview.stillConnecting, 'info'); else voiceInterview.startAnswering(); }}
                      disabled={!voiceInterview.isWsConnected}
                      className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 py-4 text-white shadow-lg ring-2 ring-emerald-500/20 transition-all hover:shadow-emerald-500/30 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500 disabled:ring-0"
                    >
                      <Mic size={24} className="shrink-0" />
                      <span className="truncate text-sm font-semibold sm:text-base">
                        {voiceInterview.isWsConnected ? 'Start answering' : 'Connecting…'}
                      </span>
                    </button>
                    <button
                      onClick={voiceInterview.repeatQuestion}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-4 text-white transition-colors hover:bg-white/20 active:scale-[0.98] sm:px-5"
                    >
                      <Volume2 size={20} className="shrink-0" />
                      <span className="whitespace-nowrap text-sm font-medium">Hear it again</span>
                    </button>
                  </div>
                )}

                {voiceInterview.state === 'active' && voiceInterview.isPlaying && (
                  <div className="flex items-center justify-center gap-3 py-3">
                    <span className="flex gap-1">
                      <span className="h-4 w-1 animate-pulse rounded-full bg-emerald-400" />
                      <span className="h-4 w-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:150ms]" />
                      <span className="h-4 w-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:300ms]" />
                    </span>
                    <span className="text-base font-medium text-white">
                      The interviewer is speaking
                    </span>
                  </div>
                )}

                {voiceInterview.state === 'answering' && (
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
                    <button
                      onClick={() => voiceInterview.submitAnswer()}
                      className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 px-6 py-4 text-white shadow-lg ring-2 ring-rose-500/20 transition-all hover:shadow-rose-500/30 hover:shadow-xl active:scale-[0.98]"
                    >
                      <Square size={22} className="shrink-0" />
                      <span className="truncate text-sm font-semibold sm:text-base">Stop &amp; submit</span>
                    </button>
                    <div className="flex shrink-0 items-center justify-center gap-3 px-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
                        <span className="text-sm font-medium text-red-300">Recording</span>
                      </span>
                      <span
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold ${answerSecondsLeft <= 30 ? 'bg-red-500/25 text-red-200' : answerSecondsLeft <= 60 ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white'}`}
                      >
                        <Timer size={14} className={answerSecondsLeft <= 30 ? 'animate-pulse' : ''} />
                        {Math.floor(answerSecondsLeft / 60)}:{String(answerSecondsLeft % 60).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                )}

                {voiceInterview.state === 'processing' && (
                  <div className="flex items-center justify-center gap-2 py-3 text-slate-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-base">The interviewer is thinking…</span>
                  </div>
                )}

                {/* Readable rather than a 12px aside. This is the instruction
                    that tells a candidate what to do next. */}
                <p className="mt-3 text-center text-xs text-slate-300 sm:text-sm">
                  {voiceInterview.state === 'active' && !voiceInterview.isPlaying &&
                    (voiceInterview.isCodingQuestion
                      ? 'Write your code above, then tap the mic to talk through it. Stop when you are done — both are submitted together.'
                      : 'Tap the mic when you are ready to answer.')}
                  {voiceInterview.state === 'active' && voiceInterview.isPlaying &&
                    'Listen to the question — the mic unlocks when they finish.'}
                  {voiceInterview.state === 'answering' &&
                    (voiceInterview.isCodingQuestion
                      ? 'Explaining your code. Tap stop when you have finished.'
                      : 'Speak clearly, then tap stop when you have finished.')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar. Full width and in the page flow on small screens,
            a fixed rail that scrolls on its own from lg up. */}
        <div className="w-full lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[var(--cardBg)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:flex lg:flex-col lg:overflow-y-auto">
          {/* Shared screen. First in the sidebar because it is the one feed the
              candidate is responsible for keeping correct — if they share the
              wrong window, nothing else here tells them. Hidden outright where
              screen recording is switched off: the empty panel's caption reads
              "your screen recording stopped", which would be a fault report for
              something that was never started. */}
          {PROCTORING_CONFIG.recording.screen.required && (
          <div className="p-3 rounded-xl bg-[var(--surface1)] border border-[var(--border)]">
            <h3 className="text-[10px] font-bold text-[var(--textSecondary)] uppercase tracking-wider mb-2 flex items-center justify-between">
              Shared Screen
              {isScreenRecording && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </h3>
            <div
              className={`aspect-video bg-black rounded-lg overflow-hidden relative shadow-inner ${
                screenStream ? '' : 'border-2 border-dashed border-[var(--border)]'
              }`}
            >
              <video
                ref={screenPreviewRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-contain ${screenStream ? '' : 'hidden'}`}
              />
              {!screenStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                  <MonitorUp size={18} className="text-[var(--textTertiary)]" />
                  <span className="text-[10px] text-[var(--textTertiary)]">
                    Screen is not being shared
                  </span>
                </div>
              )}
            </div>
            {/* A stopped share used to be one grey line of text saying it
                could not be restarted. It is the single most consequential
                thing that can go wrong in the sidebar — from that moment on
                nothing is being captured — so it reads as an alert, says why
                it most likely happened, and offers the fix. */}
            {screenStream ? (
              <p className="mt-2 text-[10px] text-[var(--textTertiary)]">
                This is what is being recorded and sent with your interview.
              </p>
            ) : (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-700/60 dark:bg-amber-900/25">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      Screen sharing stopped
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                      {screenShareStoppedEarly
                        ? 'You pressed Stop sharing, or the window you picked was closed. Nothing is being recorded until you share again.'
                        : 'Your screen is not being recorded. Share it to carry on.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReshareScreen}
                  disabled={resharingScreen}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
                >
                  {resharingScreen ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <MonitorUp size={12} />
                  )}
                  {resharingScreen ? 'Waiting for your choice…' : 'Share my screen again'}
                </button>
                <p className="mt-1 text-[9px] leading-snug text-amber-700/80 dark:text-amber-300/80">
                  What you shared before this is already saved. Pick the same screen to keep the
                  recording consistent.
                </p>
              </div>
            )}
          </div>
          )}

          {/* Camera preview. Only where the camera is opened at all — an empty
              black rectangle labelled "Camera" is worse than no panel. */}
          {cameraStreamWanted && (
          <div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-2">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--textSecondary)]">
              <Video size={12} /> <span>{isVideoRecording ? 'Recording' : 'Camera'}</span>
              {isVideoRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
          </div>
          )}

          {/* Mobile stream (second view) - Promoted to top of sidebar */}
          <div className="p-3 rounded-xl bg-[var(--surface1)] border border-[var(--border)]">
            <h3 className="text-[10px] font-bold text-[var(--textSecondary)] uppercase tracking-wider mb-2 flex items-center justify-between">
              Mobile Feed (Proctoring)
              {mobileConnected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </h3>
            <div className={`aspect-video bg-black rounded-lg overflow-hidden relative shadow-inner ${!mobileConnected ? 'border-2 border-dashed border-[var(--border)]' : ''}`}>
              {!mobileConnected ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--textTertiary)] p-4 text-center">
                  <Smartphone size={24} className="mb-2 opacity-30" />
                  {/* "Waiting" was shown even to candidates who had explicitly
                      ticked the waiver, so a deliberate choice looked like a
                      pairing that had failed and was still retrying. */}
                  <p className="text-[10px] leading-tight">
                    {mobileSkipped
                      ? 'Running without a second camera.'
                      : 'Waiting for mobile proctoring stream...'}
                  </p>
                </div>
              ) : (
                <video
                  ref={mobileVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            {mobileConnected && (
              <div className="mt-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-emerald-500 font-semibold">SECURE CONNECTION ACTIVE</span>
              </div>
            )}

            {/* Offered only once the phone's microphone has actually arrived —
                a control for a source that is not there yet is a control that
                does nothing when pressed. Disabled mid-answer because the swap
                lands on the next recording, and a switch that silently takes
                effect later reads as a switch that failed. */}
            {mobileAudioAvailable && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[var(--surface1)] px-2 py-1.5">
                <span className="text-[10px] font-medium text-[var(--textSecondary)]">
                  Microphone
                </span>
                <div className="flex items-center gap-1">
                  {(['device', 'phone'] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      disabled={voiceInterview.isRecording}
                      onClick={() => setMicSource(source)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        micSource === source
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-[var(--textSecondary)] hover:bg-[var(--surface2)]'
                      }`}
                    >
                      {source === 'device' ? 'This device' : 'Phone'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* The counters that used to live here — face warnings, fullscreen
              exits, DevTools, the running total and the "follow the guidelines"
              note — are gone. Every one of them was already in the top bar's
              warning pill and its breakdown, and a tally repeated twice on the
              same screen reads as two separate accusations rather than one
              count. What is left is only what the top bar cannot say: a live
              nudge while something is actually happening, which the candidate
              can act on in the moment. */}
          {(lookingAway || multipleFaces) && (
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              {lookingAway && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <EyeOff size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">Eyes back on the screen</span>
                </div>
              )}
              {multipleFaces && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <Users size={14} className="text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">More than one person in frame</span>
                </div>
              )}
            </div>
          )}

          {voiceInterview.isRecording && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20"><Mic size={14} className="text-red-500" /><span className="text-xs text-red-600 dark:text-red-400 font-medium">Audio Recording Active</span></div>
          )}
        </div>
      </div>
    </div>
  );
}