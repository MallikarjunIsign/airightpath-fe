import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Clock, Mic, User, Bot, Loader2, Video, AlertTriangle, Maximize, Shield,
  Wifi, WifiOff, Square, LogOut, CheckCircle2, Circle, Volume2,
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
import { interviewService } from '@/services/interview.service';
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

  // Question timer
  const questionTimer = useQuestionTimer({
    state: voiceInterview.state,
    isPlaying: voiceInterview.isPlaying,
    isCodingQuestion: voiceInterview.isCodingQuestion,
    onTimeout: () => {
      showToast(MESSAGES.interview.micToStart, 'warning');
    },
    onMaxSkips: () => {
      showToast(MESSAGES.interview.endingConsecutiveUnanswered, 'error');
      runPostCompletionFlowRef.current(false);
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
  const { secondsLeft: globalSecondsLeft, start: startGlobalTimer } = useTimer({
    initialSeconds: APP_CONFIG.INTERVIEW_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => {
      showToast(MESSAGES.interview.timeUp, 'warning');
      runPostCompletionFlowRef.current(false);
    },
  });

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
  });

  // Screen recording
  const [screenPermission, setScreenPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { start: startScreenRecording, stop: stopScreenRecording, stopAndGetBlob: stopScreenAndGetBlob, isRecording: isScreenRecording, screenStream } = useScreenRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
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
        setPostCompletionStep('uploading-screen');
        if (PROCTORING_CONFIG.recording.screen.required) {
          try {
            const screenBlob = await stopScreenAndGetBlob();
            if (screenBlob && voiceInterview.scheduleId) {
              await aiService.uploadScreenRecording(voiceInterview.scheduleId, screenBlob);
            }
          } catch (err) {
            console.error('Screen recording upload failed:', err);
          }
        }

        // The candidate's camera, which was being recorded and then discarded.
        // uploadInterviewVideo and its endpoint both existed; nothing called
        // them, so recordReferences stayed null and the reviewer's Recording
        // button never appeared for any interview.
        //
        // Uploaded after the screen and in its own try/catch on purpose: this
        // runs while the candidate waits on the "finishing" overlay, and a
        // failed upload must not cost them a completed interview.
        try {
          // stopVideoAndGetBlob is called either way — it is what releases the
          // camera. In stream-only mode it resolves null and nothing is sent.
          const videoBlob = await stopVideoAndGetBlob();
          if (videoBlob && voiceInterview.scheduleId) {
            await aiService.uploadInterviewVideo(voiceInterview.scheduleId, videoBlob);
          }
        } catch (err) {
          console.error('Camera recording upload failed:', err);
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
    [voiceInterview, stopScreenAndGetBlob, stopVideoAndGetBlob, stopDetection, navigate]
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

  useEffect(() => {
    if (voiceInterview.state !== 'pre-start' && voiceInterview.state !== 'completed' &&
      totalWarnings >= APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS) {
      showToast(MESSAGES.interview.maxWarnings, 'error');
      runPostCompletionFlow(false);
    }
  }, [totalWarnings, voiceInterview.state, runPostCompletionFlow]);

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

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [voiceInterview.conversation, voiceInterview.streamingText]);

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
      console.log('Mobile track received', event.streams[0]);
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setMobileConnected(true);
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
      await voiceInterview.startInterview({
        email: user.email,
        jobPrefix: interview.jobPrefix,
        // The interview this screen is showing. Without it the server picked
        // the most recently assigned one, so a candidate with a repeat L2 and
        // an L3 outstanding could start the round they had not chosen.
        scheduleId: interview.id,
        mobileToken: mobileToken || undefined,
      });
      startGlobalTimer();
      // The camera is opened when anything wants it: the recording, the face
      // check, or the plain requirement that it be on. Where nothing does, the
      // candidate is not prompted for it at all.
      if (cameraStreamWanted) {
        try {
          const mediaStream = await startVideoRecording({ audio: true, video: true });
          if (videoRef.current && mediaStream) {
            videoRef.current.srcObject = mediaStream;
            if (PROCTORING_CONFIG.eyeDetection.enabled) startDetection(videoRef.current);
          }
        } catch {
          showToast(MESSAGES.interview.videoRecordFailed, 'warning');
        }
      }
      if (PROCTORING_CONFIG.recording.screen.required) {
        try {
          await startScreenRecording();
          setScreenPermission('granted');
        } catch {
          setScreenPermission('denied');
          voiceInterview.sendProctoringEvent('screen_share_denied', 'Screen recording permission denied');
        }
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
          <div className="bg-[var(--cardBg)] rounded-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
            <h2 className="text-xl font-bold text-[var(--text)]">Finishing Interview...</h2>
            <div className="space-y-4 text-left">
              <div className="flex items-center gap-3">
                {getStepStatus('ending') === 'done' ? <CheckCircle2 size={20} className="text-emerald-500" /> :
                  getStepStatus('ending') === 'active' ? <Loader2 size={20} className="text-blue-500 animate-spin" /> :
                    <Circle size={20} className="text-gray-400" />}
                <span className="text-sm">Ending interview</span>
              </div>
              <div className="flex items-center gap-3">
                {getStepStatus('uploading-screen') === 'done' ? <CheckCircle2 size={20} className="text-emerald-500" /> :
                  getStepStatus('uploading-screen') === 'active' ? <Loader2 size={20} className="text-blue-500 animate-spin" /> :
                    <Circle size={20} className="text-gray-400" />}
                <span className="text-sm">Uploading screen recording</span>
              </div>
            </div>
            {postCompletionStep === 'done' && <p className="text-sm text-emerald-500 font-medium">All done! Redirecting...</p>}
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
              <Clock size={16} /> {formatTimer(globalSecondsLeft)}
            </div>
            {/* The warning pill and its breakdown, as the exam shows them —
                and, like the exam's, listing only the checks that are actually
                switched on. A counter for a check that never runs reads as a
                score the candidate cannot affect. */}
            <div className="relative group">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface1)] cursor-default ${getWarningColor()}`}>
                <Shield size={14} /> <span className="text-xs font-semibold">{totalWarnings}/{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS}</span>
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
                  {APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS} warnings end the interview. Do not
                  reload this page — the interview cannot be resumed.
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
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
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
            <div className="flex-shrink-0 border-t border-[var(--border)] px-3 sm:px-4 py-3 space-y-2">
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
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-[var(--text)]">
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
                <div className="mt-2 p-3 rounded-lg bg-[#1e1e1e] text-gray-200 font-mono text-sm overflow-auto max-h-48">
                  <pre className="whitespace-pre-wrap">{compileOutput}</pre>
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
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                {voiceInterview.state === 'active' && (
                  <>
                    <button
                      onClick={() => { if (!voiceInterview.isWsConnected) showToast(MESSAGES.interview.stillConnecting, 'info'); else voiceInterview.startAnswering(); }}
                      disabled={!voiceInterview.isWsConnected || voiceInterview.isPlaying}
                      title="Start answering"
                      className="group flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg ring-4 ring-emerald-500/15 transition-all hover:scale-105 hover:shadow-emerald-500/30 hover:shadow-xl disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500 disabled:ring-0 disabled:hover:scale-100"
                    >
                      <Mic size={26} />
                    </button>
                    <button
                      onClick={voiceInterview.repeatQuestion}
                      title="Play the question again"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface1)] text-[var(--textSecondary)] transition-colors hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                    >
                      <Volume2 size={18} />
                    </button>
                  </>
                )}
                {voiceInterview.state === 'answering' && (
                  <>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /><span className="text-sm text-red-400 font-medium">Recording...</span></div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${answerSecondsLeft <= 30 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : answerSecondsLeft <= 60 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-[var(--surface1)] text-[var(--text)]'}`}>
                      <Timer size={14} className={answerSecondsLeft <= 30 ? 'animate-pulse' : ''} />
                      {Math.floor(answerSecondsLeft / 60)}:{String(answerSecondsLeft % 60).padStart(2, '0')}
                    </div>
                    <button
                      onClick={() => voiceInterview.submitAnswer()}
                      title="Stop and submit"
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-lg ring-4 ring-rose-500/20 transition-all hover:scale-105 hover:shadow-rose-500/30 hover:shadow-xl"
                    >
                      <Square size={22} />
                    </button>
                  </>
                )}
                {voiceInterview.state === 'processing' && (
                  <div className="flex items-center gap-2 text-[var(--textSecondary)]"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">AI is responding...</span></div>
                )}
              </div>
              <div className="text-center mt-2">
                {voiceInterview.state === 'active' && !voiceInterview.isPlaying && (
                  <p className="text-xs text-[var(--textTertiary)]">{voiceInterview.isCodingQuestion ? 'Write code above. Click mic to add explanation, then stop to submit both.' : 'Click the mic to start answering before time runs out'}</p>
                )}
                {voiceInterview.state === 'active' && voiceInterview.isPlaying && <p className="text-xs text-[var(--textTertiary)]">Interviewer is speaking... wait for them to finish</p>}
                {voiceInterview.state === 'answering' && <p className="text-xs text-[var(--textTertiary)]">{voiceInterview.isCodingQuestion ? 'Speaking explanation... Click stop when done.' : 'Speak clearly. Click stop when done.'}</p>}
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
            <p className="mt-2 text-[10px] text-[var(--textTertiary)]">
              {screenStream
                ? 'This is what is being recorded and sent with your interview.'
                : 'Your screen recording stopped. Reload only if asked to — it cannot be restarted mid-interview.'}
            </p>
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