import { useState, useCallback, useRef, useEffect } from "react";
import { interviewWsService } from "@/services/interview-ws.service";
import { aiService } from "@/services/ai.service";
import { APP_CONFIG } from "@/config/app.config";
import { useAudioStreaming } from "./useAudioStreaming";
import { useAudioPlayback } from "./useAudioPlayback";
import type {
  ConversationEntry,
  StartInterviewRequest,
  VoiceInterviewState,
  VoiceEvaluationResult,
  TranscriptionMessage,
  AITokenMessage,
  TTSAudioMessage,
  TTSFallbackMessage,
  FillerMessage,
  ResponseCompleteMessage,
  WordTimestamp,
} from "@/types/interview.types";

export function useVoiceInterview() {
  // State
  const [state, setState] = useState<VoiceInterviewState>("pre-start");
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [interviewerName, setInterviewerName] = useState("Sarah");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<VoiceEvaluationResult | null>(
    null,
  );
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null,
  );

  // Item 14: Store last question audio for repeat
  const [lastQuestionAudio, setLastQuestionAudio] = useState<string | null>(
    null,
  );
  const [lastQuestionText, setLastQuestionText] = useState<string | null>(null);

  // Coding question state
  const [isCodingQuestion, setIsCodingQuestion] = useState(false);
  const [codeContent, setCodeContent] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("java");

  // Audio hooks
  const audioStreaming = useAudioStreaming();
  const audioPlayback = useAudioPlayback();

  // Stable refs for audio playback functions (avoid recreating callbacks on every render)
  const enqueueAudioRef = useRef(audioPlayback.enqueueAudio);
  enqueueAudioRef.current = audioPlayback.enqueueAudio;
  const playBrowserTTSRef = useRef(audioPlayback.playBrowserTTS);
  playBrowserTTSRef.current = audioPlayback.playBrowserTTS;

  // Refs for accumulated transcription
  const transcriptRef = useRef("");
  const wordTimestampsRef = useRef<WordTimestamp[]>([]);
  const streamingTextRef = useRef("");

  // Processing timeout ref — ensures UI never gets stuck in 'processing' state
  const processingTimeoutRef = useRef<number | null>(null);

  // Detect and clean question type tags from AI text
  const detectAndCleanCodingTag = useCallback(
    (text: string): { cleanText: string; isCoding: boolean } => {
      const tagRegex = /\[(CODING|THEORY|NON-TECH)\]\s*/i;
      const match = text.match(tagRegex);
      const isCoding = match ? match[1].toUpperCase() === "CODING" : false;
      const cleanText = text.replace(tagRegex, "").trim();
      return { cleanText, isCoding };
    },
    [],
  );

  // Subscribe to WebSocket topics
  const setupSubscriptions = useCallback(() => {
    // Real-time transcription from Whisper
    interviewWsService.subscribe(
      "transcription",
      (msg: TranscriptionMessage) => {
        transcriptRef.current += (transcriptRef.current ? " " : "") + msg.text;
        setCurrentTranscript(transcriptRef.current);
        if (msg.words) {
          wordTimestampsRef.current.push(...msg.words);
        }
      },
    );

    // AI response tokens (streaming)
    interviewWsService.subscribe("ai-token", (msg: AITokenMessage) => {
      if (msg.done) {
        const rawText = msg.fullText || streamingTextRef.current;
        streamingTextRef.current = "";
        setStreamingText("");

        // Detect and strip question type tags
        const { cleanText: fullText, isCoding } =
          detectAndCleanCodingTag(rawText);

        setIsCodingQuestion(isCoding);

        // Always reset editor when question changes
        setCodeContent("");

        if (!isCoding) {
          setCodeLanguage("java"); // optional reset
        }

        // Item 14: Store last question for repeat
        setLastQuestionText(fullText);

        setConversation((prev) => {
          const filtered = prev.filter((e) => !e.isStreaming);
          return [
            ...filtered,
            {
              role: "interviewer" as const,
              content: fullText,
              timestamp: new Date().toISOString(),
              isCodingQuestion: isCoding,
            },
          ];
        });
      } else {
        streamingTextRef.current += msg.token;
        setStreamingText(streamingTextRef.current);

        setConversation((prev) => {
          const filtered = prev.filter((e) => !e.isStreaming);
          return [
            ...filtered,
            {
              role: "interviewer" as const,
              content: streamingTextRef.current,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            },
          ];
        });
      }
    });

    // TTS audio chunks - Item 14: Store for repeat
    interviewWsService.subscribe("tts-audio", (msg: TTSAudioMessage) => {
      if (msg.isLast || msg.chunkIndex === 0) {
        setLastQuestionAudio(msg.audio);
      }
      enqueueAudioRef.current(msg.audio, msg.text, msg.isLast);
    });

    // TTS fallback (browser TTS)
    interviewWsService.subscribe("tts-fallback", (msg: TTSFallbackMessage) => {
      playBrowserTTSRef.current(msg.text);
    });

    // Filler messages
    interviewWsService.subscribe("filler", (msg: FillerMessage) => {
      setConversation((prev) => [
        ...prev,
        {
          role: "filler" as const,
          content: msg.text,
          timestamp: new Date().toISOString(),
        },
      ]);
    });

    // // Response complete
    // interviewWsService.subscribe(
    //   "response-complete",
    //   (msg: ResponseCompleteMessage) => {
    //     // Clear processing timeout — response arrived
    //     if (processingTimeoutRef.current) {
    //       clearTimeout(processingTimeoutRef.current);
    //       processingTimeoutRef.current = null;
    //     }

    //     if (msg.error) {
    //       setState("active");
    //       setError(
    //         "Something went wrong processing your answer. Please try again.",
    //       );
    //       return;
    //     }

    //     setQuestionsAsked(msg.questionsAsked);

    //     if (msg.isComplete || msg.terminated) {
    //       setState("completed");
    //     } else {
    //       setState("active");
    //     }
    //   },
    // );

    // In useVoiceInterview.ts - response-complete subscription
    interviewWsService.subscribe(
      "response-complete",
      (msg: ResponseCompleteMessage) => {
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }

        if (msg.error) {
          setState((prev) => (prev === "completed" ? prev : "active"));
          setError(
            "Something went wrong processing your answer. Please try again.",
          );
          return;
        }

        if (msg.response) {
          const responseText = msg.response;
          // 1. Handle retry message (language warning)
          if (responseText.startsWith("RETRY:")) {
            const retryMessage = responseText.replace("RETRY:", "").trim();
            setConversation((prev) => [
              ...prev,
              {
                role: "system",
                content: retryMessage,
                timestamp: new Date().toISOString(),
              },
            ]);
            // Stay in active state – same question remains
            setState("active");
            return;
          }

          // 2. Check if this is the final summary (no "FEEDBACK:" prefix)
          if (!responseText.startsWith("FEEDBACK:")) {
            // Final summary
            setConversation((prev) => [
              ...prev,
              {
                role: "interviewer",
                content: responseText,
                timestamp: new Date().toISOString(),
              },
            ]);
            setState("completed");
            return;
          }

          // 3. Normal feedback + next question
          const feedbackMatch = responseText.match(
            /FEEDBACK:\s*(.*?)\s*NEXT QUESTION:\s*(.*)/s,
          );
          if (feedbackMatch) {
            const feedback = feedbackMatch[1].trim();
            const nextQuestion = feedbackMatch[2].trim();

            // Add feedback as a system message
            setConversation((prev) => [
              ...prev,
              {
                role: "system",
                content: feedback,
                timestamp: new Date().toISOString(),
              },
            ]);

            // Add the next question as interviewer message
            const { cleanText: nextQuestionClean, isCoding } =
              detectAndCleanCodingTag(nextQuestion);
            setIsCodingQuestion(isCoding);
            setCodeContent("");
            setLastQuestionText(nextQuestionClean);

            setConversation((prev) => [
              ...prev,
              {
                role: "interviewer",
                content: nextQuestionClean,
                timestamp: new Date().toISOString(),
                isCodingQuestion: isCoding,
              },
            ]);
          }
        }

        setQuestionsAsked(msg.questionsAsked);

        if (msg.isComplete || msg.terminated) {
          setState("completed");
        } else {
          setState((prev) => (prev === "completed" ? prev : "active"));
        }
      },
    );

    // Transcription errors
    interviewWsService.subscribe(
      "transcription-error",
      (msg: { error: string }) => {
        console.error("Transcription error:", msg.error);
        setTranscriptionError(msg.error);
        setTimeout(() => setTranscriptionError(null), 5000);
      },
    );
  }, []);

  // Start interview
  const startInterview = useCallback(
    async (request: StartInterviewRequest) => {
      try {
        setState("starting");
        setError(null);

        const { data: response } = await aiService.startVoiceInterview(request);
        setScheduleId(response.scheduleId);
        setInterviewerName(response.interviewerName);

        // Detect and strip question type tags from first question
        const { cleanText: firstQuestion, isCoding } = detectAndCleanCodingTag(
          response.firstQuestion,
        );
        setIsCodingQuestion(isCoding);
        if (isCoding) {
          setCodeContent("");
        }

        // Item 14: Store first question for repeat
        setLastQuestionText(firstQuestion);
        if (response.firstQuestionAudio) {
          setLastQuestionAudio(response.firstQuestionAudio);
        }

        // Add first question to conversation
        setConversation([
          {
            role: "interviewer",
            content: firstQuestion,
            timestamp: new Date().toISOString(),
            isCodingQuestion: isCoding,
          },
        ]);

        // Connect WebSocket
        interviewWsService.connect(
          response.scheduleId,
          () => {
            setIsWsConnected(true);
            setupSubscriptions();
          },
          () => {
            setIsWsConnected(false);
          },
        );

        // Play first question audio
        if (response.firstQuestionAudio) {
          enqueueAudioRef.current(
            response.firstQuestionAudio,
            response.firstQuestion,
            true,
          );
        } else {
          playBrowserTTSRef.current(response.firstQuestion);
        }

        setState("active");
      } catch (err: any) {
        console.error("Failed to start interview:", err);
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to start interview",
        );
        setState("error");
      }
    },
    [setupSubscriptions],
  );

  // Start answering (recording)
  const startAnswering = useCallback(async () => {
    transcriptRef.current = "";
    wordTimestampsRef.current = [];
    setCurrentTranscript("");

    // Interrupt any playing audio
    audioPlayback.stopPlayback();
    interviewWsService.send("interrupt", { reason: "candidate_speaking" });

    await audioStreaming.startRecording();
    setState("answering");
  }, [audioStreaming, audioPlayback]);

  // Submit answer — stops recording, waits for final transcription, then sends
  const submitAnswer = useCallback(
    async (manualTranscript?: string) => {
      // Wait for the final audio chunk to be flushed and sent to BE
      await audioStreaming.stopRecording();

      if (!manualTranscript) {
        // Wait for the backend to transcribe the final chunk and send it back.
        // The last chunk was just sent — give Whisper time to process it.
        const transcriptBefore = transcriptRef.current;
        await new Promise<void>((resolve) => {
          let elapsed = 0;
          const interval = setInterval(() => {
            elapsed += 200;
            // Resolve once new transcription arrives or timeout after 3s
            if (transcriptRef.current !== transcriptBefore || elapsed >= 3000) {
              clearInterval(interval);
              resolve();
            }
          }, 200);
        });
      }

      const transcript = manualTranscript || transcriptRef.current;
      if (!transcript.trim()) {
        setState("active");
        return;
      }

      // Capture current code state before resetting
      const submittedCode = codeContent;
      const submittedLanguage = codeLanguage;

      // Add candidate answer to conversation
      setConversation((prev) => [
        ...prev,
        {
          role: "candidate",
          content: transcript,
          timestamp: new Date().toISOString(),
          codeContent: submittedCode || undefined,
          codeLanguage: submittedCode ? submittedLanguage : undefined,
        },
      ]);

      // Send via WebSocket — include code if present
      const payload: Record<string, unknown> = {
        transcript,
        wordTimestamps: wordTimestampsRef.current,
      };
      if (submittedCode) {
        payload.codeContent = submittedCode;
        payload.codeLanguage = submittedLanguage;
      }
      interviewWsService.send("submit-answer", payload);

      setState("processing");

      // Start safety timeout — if response-complete never arrives, recover the UI
      processingTimeoutRef.current = window.setTimeout(() => {
        console.error("Processing timeout — no response-complete received");
        processingTimeoutRef.current = null;
        setState("active");
        setError("Response timed out. Please try answering again.");
      }, APP_CONFIG.INTERVIEW_PROCESSING_TIMEOUT_MS);
    },
    [audioStreaming, codeContent, codeLanguage],
  );

  // Skip question — sends a skipped answer bypassing the empty-transcript guard
  const skipQuestion = useCallback(() => {
    setIsCodingQuestion(false);
    setCodeContent("");

    setConversation((prev) => [
      ...prev,
      {
        role: "candidate",
        content: "[No response - skipped]",
        timestamp: new Date().toISOString(),
      },
    ]);

    // Send only the answer (empty) with skip flag
    interviewWsService.send("submit-answer", {
      transcript: "",
      wordTimestamps: [],
      skipped: true,
    });

    setState("processing");

    // Start safety timeout
    processingTimeoutRef.current = window.setTimeout(() => {
      console.error("Processing timeout — no response-complete received");
      processingTimeoutRef.current = null;
      setState("active");
      setError("Response timed out. Please try answering again.");
    }, APP_CONFIG.INTERVIEW_PROCESSING_TIMEOUT_MS);
  }, []);

  // Send proctoring event
  const sendProctoringEvent = useCallback((type: string, details: string) => {
    interviewWsService.send("proctoring-event", { type, details });
  }, []);

  // End interview
  const endInterview = useCallback(async () => {
    await audioStreaming.stopRecording();
    audioPlayback.stopPlayback();

    if (scheduleId !== null) {
      try {
        await aiService.endVoiceInterview(scheduleId);
      } catch (err) {
        console.error("Error ending interview:", err);
      }
    }

    setState("completed");
  }, [scheduleId, audioStreaming, audioPlayback]);

  // Item 14: Repeat last question
  const repeatQuestion = useCallback(() => {
    if (lastQuestionAudio) {
      enqueueAudioRef.current(lastQuestionAudio, lastQuestionText || "", true);
    } else if (lastQuestionText) {
      playBrowserTTSRef.current(lastQuestionText);
    }
  }, [lastQuestionAudio, lastQuestionText]);

  // Fetch evaluation with polling (async generation may not be ready immediately)
  const fetchEvaluation = useCallback(async () => {
    if (scheduleId === null) return null;

    const MAX_RETRIES = 10;
    const INITIAL_DELAY = 3000;
    const MAX_DELAY = 15000;
    const BACKOFF_FACTOR = 1.5;
    let delay = INITIAL_DELAY;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { data: result } = await aiService.getVoiceEvaluation(scheduleId);
        if (
          result &&
          result.overallScore !== undefined &&
          result.overallScore > 0
        ) {
          setEvaluation(result);
          return result;
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          console.error(
            "Error fetching evaluation (attempt " + (attempt + 1) + "):",
            err,
          );
        }
      }

      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY);
      }
    }

    setError("Evaluation generation timed out. Please check results later.");
    return null;
  }, [scheduleId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      interviewWsService.disconnect();
      audioStreaming.stopRecording();
      audioPlayback.stopPlayback();
    };
  }, []);

  return {
    // State
    state,
    scheduleId,
    interviewerName,
    conversation,
    questionsAsked,
    streamingText,
    isWsConnected,
    error,
    evaluation,
    currentTranscript,
    transcriptionError,

    // Coding question state
    isCodingQuestion,
    codeContent,
    codeLanguage,
    setCodeContent,
    setCodeLanguage,

    // Audio state
    isRecording: audioStreaming.isRecording,
    isPlaying: audioPlayback.isPlaying,
    amplitude: audioPlayback.amplitude,
    audioLevel: audioStreaming.audioLevel,

    // Actions
    startInterview,
    startAnswering,
    submitAnswer,
    skipQuestion,
    endInterview,
    sendProctoringEvent,
    fetchEvaluation,
    repeatQuestion,
  };
}
