import { useState, useCallback, useRef, useEffect } from "react";
import { interviewWsService } from "@/services/interview-ws.service";
import { aiService } from "@/services/ai.service";
import { getAccessToken } from "@/services/api.service";
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
  /**
   * The same id, readable from a callback that was built before it arrived.
   *
   * Every STOMP destination in this hook embeds the schedule id, and the id
   * only exists after `startInterview` has answered — so a callback memoised on
   * the first render captures `null` and publishes to
   * `/app/interview/null/submit-answer`, which matches no `@MessageMapping`.
   * The message is dropped without a reply, the UI waits in `processing`, and
   * the candidate is told "Response timed out" however many times they try.
   * Reading through a ref keeps the destination correct no matter when the
   * callback was created.
   */
  const scheduleIdRef = useRef<number | null>(null);
  const [interviewerName, setInterviewerName] = useState("Sarah");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [isWsConnected, setIsWsConnected] = useState(false);
  /**
   * Whether the interview socket has ever been up.
   *
   * The "Connection lost" banner keys off this. Without it the banner shows
   * from the moment the interview screen renders — including when the real
   * failure was the start call, which has nothing to do with the network.
   */
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
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
  /**
   * The spoken question, chunk by chunk, for the replay control.
   *
   * A ref rather than state: it is written on every audio frame and read only
   * when the candidate asks to hear the question again, so re-rendering the
   * interview on each chunk would cost a great deal and change nothing.
   */
  const questionAudioRef = useRef<Map<number, string>>(new Map());

  // Coding question state
  const [isCodingQuestion, setIsCodingQuestion] = useState(false);
  const [codeContent, setCodeContent] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("java");
  /**
   * What the candidate's code printed the last time they ran it.
   *
   * Lives here rather than in the page because it has to travel with the answer:
   * the Compile & Run output used to be page-local state, so the interviewer was
   * sent the source and never learned whether it worked.
   */
  const [codeOutput, setCodeOutput] = useState("");

  // Audio hooks
  // Takes the id only; the email was being passed and silently discarded.
  const audioStreaming = useAudioStreaming(scheduleId);
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

  /**
   * Publish to one of this interview's destinations.
   *
   * Deliberately takes only the action, so no caller can assemble a destination
   * with a stale or missing id, and refuses to send at all before the id is
   * known — a dropped message with a warning beats one silently addressed to
   * `null`.
   */
  const sendToInterview = useCallback(
    (action: string, body: Record<string, unknown>) => {
      const id = scheduleIdRef.current;
      if (id === null) {
        console.warn(`Ignoring "${action}" — the interview has not started yet.`);
        return;
      }
      interviewWsService.send(`/app/interview/${id}/${action}`, body);
    },
    [],
  );

  // Subscribe to WebSocket topics
  const setupSubscriptions = useCallback(
    (id: number) => {
      // Real-time transcription from Whisper
      interviewWsService.subscribe(
        `/topic/interview/${id}/transcription`,
        (msg: TranscriptionMessage) => {
          transcriptRef.current +=
            (transcriptRef.current ? " " : "") + msg.text;
          setCurrentTranscript(transcriptRef.current);
          if (msg.words) {
            wordTimestampsRef.current.push(...msg.words);
          }
        },
      );

      // AI response tokens (streaming)
      interviewWsService.subscribe(
        `/topic/interview/${id}/ai-token`,
        (msg: AITokenMessage) => {
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
        },
      );

      // TTS audio chunks, kept so the question can be replayed.
      //
      // Every chunk, not one of them. A question is spoken as several sentence
      // batches, and only chunk 0 or the last chunk used to be stored — so
      // "say it again" replayed a fragment of the question rather than the
      // question. Keyed by index because replaying them out of order would be
      // worse than not replaying at all.
      interviewWsService.subscribe(
        `/topic/interview/${id}/tts-audio`,
        (msg: TTSAudioMessage) => {
          if (msg.chunkIndex === 0) {
            questionAudioRef.current.clear();
          }
          if (msg.audio) {
            questionAudioRef.current.set(msg.chunkIndex, msg.audio);
          }
          enqueueAudioRef.current(msg.audio, msg.text, msg.isLast);
        },
      );

      // TTS fallback (browser TTS)
      interviewWsService.subscribe(
        `/topic/interview/${id}/tts-fallback`,
        (msg: TTSFallbackMessage) => {
          playBrowserTTSRef.current(msg.text);
        },
      );

      // Filler messages
      interviewWsService.subscribe(
        `/topic/interview/${id}/filler`,
        (msg: FillerMessage) => {
          setConversation((prev) => [
            ...prev,
            {
              role: "filler" as const,
              content: msg.text,
              timestamp: new Date().toISOString(),
            },
          ]);
        },
      );

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
        `/topic/interview/${id}/response-complete`,
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

            // 2. The interviewer's turn.
            //
            // Whether the interview is over is decided by msg.isComplete
            // below, never by the shape of this text. It used to be inferred
            // from the absence of a "FEEDBACK:" prefix, which was true of the
            // old fixed-question protocol and became true of every reply once
            // questions were generated — so the interview "completed" the
            // moment the candidate answered the first question.
            const { cleanText, isCoding } = detectAndCleanCodingTag(responseText);

            setIsCodingQuestion(isCoding);
            if (isCoding) {
              setCodeContent("");
              // Cleared with the editor: output from the previous problem would
              // otherwise be submitted as evidence for this one.
              setCodeOutput("");
            }
            setLastQuestionText(cleanText);
            // The previous question's audio must not outlive it: a turn that is
            // never spoken (a code-explanation question skips TTS) would
            // otherwise leave "say it again" replaying the question before it.
            questionAudioRef.current.clear();

            setConversation((prev) => [
              ...prev,
              {
                role: "interviewer",
                content: cleanText,
                timestamp: new Date().toISOString(),
                isCodingQuestion: isCoding,
              },
            ]);
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
        `/topic/interview/${id}/transcription-error`,
        (msg: { error: string }) => {
          console.error("Transcription error:", msg.error);
          setTranscriptionError(msg.error);
          setTimeout(() => setTranscriptionError(null), 5000);
        },
      );
    },
    [detectAndCleanCodingTag],
  );

  // Start interview
  const startInterview = useCallback(
    async (request: StartInterviewRequest) => {
      try {
        setState("starting");
        setError(null);

        const { data: response } = await aiService.startVoiceInterview(request);
        setScheduleId(response.scheduleId);
        scheduleIdRef.current = response.scheduleId;
        setInterviewerName(response.interviewerName);

        // Detect and strip question type tags from first question
        const { cleanText: firstQuestion, isCoding } = detectAndCleanCodingTag(
          response.firstQuestion,
        );
        setIsCodingQuestion(isCoding);
        if (isCoding) {
          setCodeContent("");
          setCodeOutput("");
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

        interviewWsService.disconnect();
        // Connect WebSocket with both scheduleId and JWT token
        const token = getAccessToken();

        if (!token) {
          console.error("❌ No JWT token found. WebSocket connection blocked.");
          return;
        }

        interviewWsService.connect({
          scheduleId: response.scheduleId,
          token: token, // REQUIRED
          email: request.email,
          mobileToken: request.mobileToken || undefined, 
      
          onConnect: () => {
            setIsWsConnected(true);
            setHasEverConnected(true);
            setReconnectAttempts(0);
            setupSubscriptions(response.scheduleId);
          },
          onDisconnect: () => {
            setIsWsConnected(false);
          },
          onReconnectAttempt: setReconnectAttempts,
        });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    sendToInterview("interrupt", { reason: "candidate_speaking" });

    await audioStreaming.startRecording();
    setState("answering");
  }, [audioStreaming, audioPlayback, sendToInterview]);

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
      const submittedOutput = codeOutput;

      // Add candidate answer to conversation
      setConversation((prev) => [
        ...prev,
        {
          role: "candidate",
          content: transcript,
          timestamp: new Date().toISOString(),
          codeContent: submittedCode || undefined,
          codeLanguage: submittedCode ? submittedLanguage : undefined,
          codeOutput: submittedCode ? submittedOutput || undefined : undefined,
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
        // Sent only when they actually ran it. The server reads an absent value
        // as "never run" and tells the model so explicitly.
        if (submittedOutput.trim()) {
          payload.codeOutput = submittedOutput;
        }
      }
      sendToInterview("submit-answer", payload);

      setState("processing");

      // Start safety timeout — if response-complete never arrives, recover the UI
      processingTimeoutRef.current = window.setTimeout(() => {
        console.error("Processing timeout — no response-complete received");
        processingTimeoutRef.current = null;
        setState("active");
        setError("Response timed out. Please try answering again.");
      }, APP_CONFIG.INTERVIEW_PROCESSING_TIMEOUT_MS);
    },
    [audioStreaming, codeContent, codeLanguage, codeOutput, sendToInterview],
  );

  // Skip question — sends a skipped answer bypassing the empty-transcript guard
  const skipQuestion = useCallback(() => {
    setIsCodingQuestion(false);
    setCodeContent("");
    setCodeOutput("");

    setConversation((prev) => [
      ...prev,
      {
        role: "candidate",
        content: "[No response - skipped]",
        timestamp: new Date().toISOString(),
      },
    ]);

    // Send only the answer (empty) with skip flag
    sendToInterview("submit-answer", {
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
  }, [sendToInterview]);

  // Send proctoring event
  const sendProctoringEvent = useCallback(
    (type: string, details: string) => {
      sendToInterview("proctoring-event", { type, details });
    },
    [sendToInterview],
  );

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
  /**
   * Say the current question again, on demand.
   *
   * Prefers the interviewer's own recorded voice, replayed in chunk order so
   * the candidate hears the whole question. Falls back to the browser's speech
   * synthesis reading the question text, which covers the case where TTS was
   * unavailable and the question only ever existed as text — better a
   * synthetic voice than a control that does nothing.
   */
  const repeatQuestion = useCallback(() => {
    audioPlayback.stopPlayback();

    const chunks = [...questionAudioRef.current.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, audio]) => audio);

    if (chunks.length > 0) {
      chunks.forEach((audio, index) =>
        enqueueAudioRef.current(audio, index === 0 ? lastQuestionText || "" : "", index === chunks.length - 1),
      );
      return;
    }

    if (lastQuestionAudio) {
      enqueueAudioRef.current(lastQuestionAudio, lastQuestionText || "", true);
    } else if (lastQuestionText) {
      playBrowserTTSRef.current(lastQuestionText);
    }
  }, [audioPlayback, lastQuestionAudio, lastQuestionText]);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    hasEverConnected,
    reconnectAttempts,
    error,
    evaluation,
    currentTranscript,
    transcriptionError,

    // Coding question state
    isCodingQuestion,
    codeContent,
    codeLanguage,
    codeOutput,
    setCodeOutput,
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
