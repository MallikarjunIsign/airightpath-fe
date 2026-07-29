import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Clock, Mic, User, Bot, Loader2, Video, AlertTriangle, Maximize, Shield,
  Wifi, WifiOff, Square, LogOut, CheckCircle2, Circle, Volume2,
  EyeOff, Users, Timer, Monitor, Play, Smartphone,
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
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { APP_CONFIG } from '@/config/app.config';
import { ROUTES } from '@/config/routes';
import { MESSAGES } from '@/config/messages';
import { InterviewPreStartScreen } from '@/components/interview/InterviewPreStartScreen';
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
  const [postCompletionStep, setPostCompletionStep] = useState<PostCompletionStep>(null);
  const postCompletionStartedRef = useRef(false);

  // Permissions
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  // Instruction countdown & audio narration
  const [instructionCountdown, setInstructionCountdown] = useState(APP_CONFIG.INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const { isSpeaking, speak: speakInstruction, stop: stopInstruction } = useSpeechSynthesis();

  // Answer timer
  const [answerSecondsLeft, setAnswerSecondsLeft] = useState(APP_CONFIG.INTERVIEW_ANSWER_TIMEOUT_SECONDS);
  const answerTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Inactivity timers
  const inactivityWarningRef = useRef<number | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const inactivityWarningShownRef = useRef(false);
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
  const { start: startVideoRecording, stop: stopVideoRecording, isRecording: isVideoRecording, stream: recorderStream } = useMediaRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
  });

  // Screen recording
  const [screenPermission, setScreenPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { start: startScreenRecording, stop: stopScreenRecording, stopAndGetBlob: stopScreenAndGetBlob, isRecording: isScreenRecording } = useScreenRecorder({
    timeslice: APP_CONFIG.VIDEO_CHUNK_SECONDS * 1000,
    onScreenStop: () => {
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
        try {
          const screenBlob = await stopScreenAndGetBlob();
          if (screenBlob && voiceInterview.scheduleId) {
            await aiService.uploadScreenRecording(voiceInterview.scheduleId, screenBlob);
          }
        } catch (err) {
          console.error('Screen recording upload failed:', err);
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
    [voiceInterview, stopScreenAndGetBlob, stopDetection, navigate]
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
      showToast(MESSAGES.interview.endingInactivity, 'error');
      runPostCompletionFlowRef.current(false);
    }, APP_CONFIG.INTERVIEW_INACTIVITY_TIMEOUT_SECONDS * 1000);
  }, [clearInactivityTimers, showToast]);

  useEffect(() => {
    if (voiceInterview.state === 'active' && !voiceInterview.isPlaying) {
      startInactivityTimers();
    } else {
      clearInactivityTimers();
    }
    return () => clearInactivityTimers();
  }, [voiceInterview.state, voiceInterview.isPlaying, startInactivityTimers, clearInactivityTimers]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setCompileOutput('Compilation failed: ' + (err.response?.data?.message || err.message));
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

    // If setup is not active, start setup (show QR)
    if (!isSetupActive) {
      setIsSetupActive(true);
      return;
    }

    // If mobile is not verified, we proceed anyway if the user clicks "Skip & Begin"
    if (!mobileVerified) {
      setMobileVerified(true);
      showToast(MESSAGES.interview.proceedingWithoutRoom, 'info');
    }

    if (wsConnected) {
      interviewWsService.disconnect(); // disconnect mobile pairing WS
    }

    stopInstruction();
    try {
      await enterFullscreen();
      await loadModels();
      await voiceInterview.startInterview({
        email: user.email,
        jobPrefix: interview.jobPrefix,
        mobileToken: mobileToken || undefined,
      });
      startGlobalTimer();
      try {
        const mediaStream = await startVideoRecording({ audio: true, video: true });
        if (videoRef.current && mediaStream) {
          videoRef.current.srcObject = mediaStream;
          startDetection(videoRef.current);
        }
      } catch {
        showToast(MESSAGES.interview.videoRecordFailed, 'warning');
      }
      try {
        await startScreenRecording();
        setScreenPermission('granted');
      } catch {
        setScreenPermission('denied');
        voiceInterview.sendProctoringEvent('screen_share_denied', 'Screen recording permission denied');
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

  // Pre-start screen with QR code
  if (voiceInterview.state === 'pre-start' || voiceInterview.state === 'starting') {
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
        error={voiceInterview.error}
        starting={voiceInterview.state === 'starting'}
        canStartInterview={canStartInterview}
        onStart={handleStartInterview}
      />
    );
  }


  // Main interview screen
  return (
    <div className="h-screen overflow-hidden bg-[var(--background)] flex flex-col">
      {/* Disconnect banner */}
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

      {/* Fullscreen enforcement */}
      {!isFullscreen && voiceInterview.state !== 'completed' && !postCompletionStep && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[var(--cardBg)] rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
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
      <div className="sticky top-0 z-10 bg-[var(--cardBg)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Badge variant="info">Voice Interview</Badge>
            <span className="text-sm text-[var(--textSecondary)]">{interview.jobPrefix}</span>
          </div>
          <div className="flex items-center gap-4">
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
            <div className="relative group">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface1)] cursor-default ${getWarningColor()}`}>
                <Shield size={14} /> <span className="text-xs font-semibold">{totalWarnings}/{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS}</span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--cardBg)] rounded-lg shadow-lg border border-[var(--border)] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                <p className="text-xs font-semibold text-[var(--text)] mb-2">Warning Breakdown</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span>Face Warnings</span><span className="font-mono">{faceWarnings}</span></div>
                  <div className="flex justify-between"><span>Fullscreen Exits</span><span className="font-mono">{fullscreenExitCount}</span></div>
                  <div className="flex justify-between"><span>DevTools</span><span className="font-mono">{devToolsCount}</span></div>
                </div>
              </div>
            </div>
            <button onClick={() => setShowEndConfirm(true)} disabled={!!postCompletionStep} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
              <LogOut size={14} /> End
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-6xl mx-auto w-full min-h-0">
        {/* Left Column */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-center py-6 border-b border-[var(--border)]">
            <AIAvatar isSpeaking={voiceInterview.isPlaying} isListening={voiceInterview.isRecording} isThinking={voiceInterview.state === 'processing'} amplitude={voiceInterview.amplitude} size="md" />
          </div>

          {/* Conversation area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {voiceInterview.conversation.map((entry, idx) => (
              <div key={idx} className={`flex items-start gap-3 ${entry.role === 'candidate' ? 'flex-row-reverse' : ''} ${entry.role === 'filler' ? 'opacity-60' : ''}`}>
                {entry.role !== 'filler' && entry.role !== 'system' && (
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.role === 'interviewer' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                    {entry.role === 'interviewer' ? <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <User className="w-4 h-4 text-green-600 dark:text-green-400" />}
                  </div>
                )}
                <div className={`max-w-[70%] p-4 rounded-lg ${entry.role === 'interviewer' ? 'bg-[var(--surface1)] text-[var(--text)]' : entry.role === 'candidate' ? 'bg-[var(--primary)] text-white' : entry.role === 'system' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm border border-amber-200 dark:border-amber-800' : 'bg-transparent text-[var(--textTertiary)] italic text-sm p-2'} ${entry.isStreaming ? 'border border-blue-300 dark:border-blue-700' : ''}`}>
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

          {/* Coding Editor & Compile */}
          {voiceInterview.isCodingQuestion && voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
              <CodingEditor code={voiceInterview.codeContent} language={voiceInterview.codeLanguage} onCodeChange={voiceInterview.setCodeContent} onLanguageChange={voiceInterview.setCodeLanguage} disabled={voiceInterview.state === 'processing'} />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleCompile} disabled={compiling || !voiceInterview.codeContent.trim()}>
                  {compiling ? <Loader2 size={14} className="animate-spin mr-2" /> : <Play size={14} className="mr-2" />}
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

          {/* Voice controls */}
          {voiceInterview.state !== 'completed' && !postCompletionStep && (
            <div className="border-t border-[var(--border)] bg-[var(--cardBg)] p-4">
              {voiceInterview.transcriptionError && (
                <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">Speech not captured: {voiceInterview.transcriptionError}</span>
                </div>
              )}
              {voiceInterview.isRecording && voiceInterview.currentTranscript && (
                <div className="mb-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <p className="text-xs text-[var(--textTertiary)] mb-1">Live Transcription:</p>
                  <p className="text-sm text-[var(--text)]">{voiceInterview.currentTranscript}</p>
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
              <div className="flex items-center justify-center gap-4">
                {voiceInterview.state === 'active' && (
                  <>
                    <button onClick={() => { if (!voiceInterview.isWsConnected) showToast(MESSAGES.interview.stillConnecting, 'info'); else voiceInterview.startAnswering(); }} disabled={!voiceInterview.isWsConnected || voiceInterview.isPlaying} className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-lg hover:shadow-xl"><Mic size={28} /></button>
                    <button onClick={voiceInterview.repeatQuestion} className="w-10 h-10 rounded-full bg-[var(--surface1)] hover:bg-[var(--border)] text-[var(--textSecondary)] flex items-center justify-center transition-colors"><Volume2 size={18} /></button>
                  </>
                )}
                {voiceInterview.state === 'answering' && (
                  <>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /><span className="text-sm text-red-400 font-medium">Recording...</span></div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${answerSecondsLeft <= 30 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : answerSecondsLeft <= 60 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-[var(--surface1)] text-[var(--text)]'}`}>
                      <Timer size={14} className={answerSecondsLeft <= 30 ? 'animate-pulse' : ''} />
                      {Math.floor(answerSecondsLeft / 60)}:{String(answerSecondsLeft % 60).padStart(2, '0')}
                    </div>
                    <button onClick={() => voiceInterview.submitAnswer()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg hover:shadow-xl animate-pulse"><Square size={24} /></button>
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

        {/* Right Sidebar */}
        <div className="w-72 border-l border-[var(--border)] bg-[var(--cardBg)] p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Camera preview */}
          <div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-2">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--textSecondary)]">
              <Video size={12} /> <span>{isVideoRecording ? 'Recording' : 'Camera'}</span>
              {isVideoRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
          </div>

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
                  <p className="text-[10px] leading-tight">Waiting for mobile proctoring stream...</p>
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

          {/* Interviewer info */}
          <div className="p-3 rounded-lg bg-[var(--surface1)]">
            <p className="text-xs text-[var(--textTertiary)] mb-1">Interviewer</p>
            <p className="text-sm font-medium text-[var(--text)]">{voiceInterview.interviewerName}</p>
          </div>

          {/* Proctoring status */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Proctoring Status</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span>Face Warnings</span><span className={`font-mono font-semibold ${faceWarnings > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{faceWarnings}</span></div>
              <div className="flex items-center justify-between"><span>Fullscreen Exits</span><span className={`font-mono font-semibold ${fullscreenExitCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{fullscreenExitCount}</span></div>
              <div className="flex items-center justify-between"><span>DevTools</span><span className={`font-mono font-semibold ${devToolsCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{devToolsCount}</span></div>
              {lookingAway && <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20"><EyeOff size={14} className="text-amber-500" /><span className="text-xs text-amber-700 dark:text-amber-300 font-medium">Looking Away</span></div>}
              {multipleFaces && <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20"><Users size={14} className="text-red-500" /><span className="text-xs text-red-600 dark:text-red-400 font-medium">Multiple Faces</span></div>}
              <div className="pt-2 border-t border-[var(--border)]"><div className="flex items-center justify-between"><span className="font-medium">Total Warnings</span><span className={`font-mono font-bold ${getWarningColor()}`}>{totalWarnings}/{APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS}</span></div></div>
            </div>
            {totalWarnings > 0 && <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20"><AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" /><p className="text-xs text-amber-700 dark:text-amber-300">{totalWarnings >= 4 ? 'Critical: One more warning will end the interview.' : 'Please follow the interview guidelines to avoid warnings.'}</p></div>}
          </div>

          {voiceInterview.isRecording && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20"><Mic size={14} className="text-red-500" /><span className="text-xs text-red-600 dark:text-red-400 font-medium">Audio Recording Active</span></div>
          )}
        </div>
      </div>
    </div>
  );
}