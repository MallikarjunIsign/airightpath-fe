import { useState, useRef, useCallback } from "react";
import { APP_CONFIG } from "@/config/app.config";
import { MIC_AUDIO_CONSTRAINTS, describeMicProcessing, micProcessingReport } from "@/config/audio.config";
import { interviewWsService } from "@/services/interview-ws.service";
import { aiService } from "@/services/ai.service";

/**
 * Hook for streaming audio chunks to the backend for live transcription.
 *
 * Uses a stop-restart MediaRecorder pattern so that EVERY chunk is a
 * self-contained audio file with full container headers (EBML/WebM).
 * This is critical because Whisper needs valid files — the timeslice
 * approach only puts headers in the first chunk, making subsequent
 * chunks undecodeable.
 */
/**
 * Level, on the same 0-100 scale as `audioLevel`, below which a chunk is
 * treated as holding no speech.
 *
 * Was set at near-digital-silence, on the reasoning that dropping a chunk is
 * unrecoverable while a hallucination is unlikely. In a real room it is the
 * other way round: a fan, a keyboard, traffic through a window all clear
 * digital silence easily, and Whisper does not return an empty string for
 * them — it returns fluent invention, which lands in the transcript as
 * something the candidate said and is then scored.
 *
 * Six is still well below speech. A candidate talking at any audible level
 * clears it without trying; a quiet room with a fan in it does not. Tunable
 * with VITE_TRANSCRIPTION_SILENCE_FLOOR, because what counts as background
 * depends on the room and the microphone.
 */
/** Smallest blob worth sending; below this Whisper answers "audio too short". */
const MIN_CHUNK_BYTES = 2000;

const SILENCE_FLOOR = parseFloat(import.meta.env.VITE_TRANSCRIPTION_SILENCE_FLOOR ?? '') || 6;

/**
 * How many readings in a chunk must be above the floor.
 *
 * One loud moment (a cough, a knock, a chair) set the peak and sent a whole chunk of room noise to be
 * transcribed, and Whisper turned it into sentences. Speech holds the level up across many readings, a
 * knock does not, so a chunk now needs a stretch of sound (about a sixth of a second) and not just a spike.
 */
const MIN_SPEECH_READINGS = parseInt(import.meta.env.VITE_TRANSCRIPTION_MIN_SPEECH_READINGS ?? '', 10) || 6;

/** A pause this long is a place to cut the audio without splitting a word. */
const PAUSE_MS = 700;
/** Past the longest chunk, a shorter pause will do. */
const SHORT_PAUSE_MS = 250;
/** If no pause at all turns up this long after the longest chunk, cut anyway. */
const HARD_CUT_GRACE_MS = 30_000;
const MIN_CHUNK_MS = APP_CONFIG.AUDIO_CHUNK_SECONDS * 1000;
const MAX_CHUNK_MS = Math.max(MIN_CHUNK_MS, APP_CONFIG.AUDIO_CHUNK_MAX_SECONDS * 1000);

/**
 * @param onChunkSettled called once for every chunk sent, with whether the audio was accepted. The page waits for
 *        these before it submits, so it knows the last of the answer has been dealt with.
 */
export function useAudioStreaming(
  scheduleId: number | null,
  onChunkSettled?: (chunkIndex: number, ok: boolean) => void,
) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * An audio source to record instead of this device's microphone.
   *
   * Set when the candidate chooses their paired phone. Held as a ref, not
   * state, because it is read once at the moment recording starts and
   * re-rendering the interview when it changes would buy nothing.
   */
  const externalSourceRef = useRef<MediaStream | null>(null);
  /**
   * Whether the stream being recorded is one this hook opened.
   *
   * It decides whether stopping may end the tracks. A phone's audio arrives
   * over the same WebRTC connection as its video, so stopping its track would
   * take the second camera down with it — and it would not come back for the
   * next answer.
   */
  const ownsStreamRef = useRef(true);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);
  /** Chunks sent for the answer being recorded; not reset when recording stops, so the page can still count them. */
  const sentCountRef = useRef(0);
  const onChunkSettledRef = useRef(onChunkSettled);
  onChunkSettledRef.current = onChunkSettled;
  /** When the recorder now running began, and since when the sound has been below the floor. */
  const chunkStartedAtRef = useRef(0);
  const quietSinceRef = useRef<number | null>(null);
  const rotateRef = useRef<() => void>(() => {});
  const mimeTypeRef = useRef<string>("audio/webm");
  const isStoppingRef = useRef(false);

  // Item 12: Audio level analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  /**
   * Loudest moment since the last chunk was sent.
   *
   * Whisper does not return an empty string for silence — it returns fluent
   * invention, and "Thank you for joining us" reached a candidate's transcript
   * that way. A chunk that never rose above the floor below held no speech, so
   * it is dropped rather than transcribed.
   */
  const peakSinceChunkRef = useRef(0);
  /** Readings above the floor since the last chunk was sent. */
  const loudReadingsRef = useRef(0);
  /**
   * Whether the analyser has produced a single reading.
   *
   * The gate below has to fail open. An AudioContext can come back suspended,
   * and level monitoring is best-effort inside a try/catch — in either case the
   * analyser reports nothing, the peak stays zero, and gating on it alone would
   * discard every chunk of every answer and leave the interview stuck on its
   * first question with nothing said about why. Silence is only ever inferred
   * from a measurement that actually happened.
   */
  const levelObservedRef = useRef(false);

  /** Send a complete audio blob to the backend via WebSocket. */
  const sendChunk = useCallback(
    (blob: Blob) => {
      if (blob.size === 0 || !scheduleId) return;

      // A webm/opus blob this small is a container header with no audio in it.
      // Whisper rejects those with "audio too short" (400), so the backend
      // logged an error and burned an API call for every one.
      if (blob.size < MIN_CHUNK_BYTES) {
        console.debug(`Skipping tiny audio chunk (${blob.size} bytes)`);
        peakSinceChunkRef.current = 0;
        loudReadingsRef.current = 0;
        return;
      }

      // Read and reset before the async work below, so the next chunk measures
      // its own window rather than inheriting this one's peak.
      const peak = peakSinceChunkRef.current;
      const loudReadings = loudReadingsRef.current;
      peakSinceChunkRef.current = 0;
      loudReadingsRef.current = 0;
      if (levelObservedRef.current && (peak < SILENCE_FLOOR || loudReadings < MIN_SPEECH_READINGS)) {
        // At info, not debug: when a candidate says their voice was not picked up, this is the evidence.
        console.info(
          `Skipping audio chunk with no sustained speech (speech-band peak ${peak}, ${loudReadings} readings above ${SILENCE_FLOOR}; needs ${MIN_SPEECH_READINGS})`,
        );
        return;
      }

      // A file over HTTP, with one retry: a chunk can hold most of an answer, so it is worth a second try.
      const index = chunkIndexRef.current++;
      sentCountRef.current += 1;
      console.log(`Sending audio chunk ${index} (${Math.round(blob.size / 1024)} KB)`);
      void (async () => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await aiService.sendAudioChunk(scheduleId, blob, index);
            return;
          } catch (err) {
            if (attempt === 2) {
              console.warn(`Audio chunk ${index} could not be sent:`, err);
              onChunkSettledRef.current?.(index, false);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      })();
    },
    [scheduleId],
  );

  /** Create a new MediaRecorder on the given stream and start it. */
  const createRecorder = useCallback(
    (stream: MediaStream): MediaRecorder => {
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeTypeRef.current,
        // Speech needs little: 32 kbit/s keeps three minutes under a megabyte.
        audioBitsPerSecond: 32_000,
      });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          sendChunk(e.data);
        }
      };

      // start() with no timeslice → records continuously until stop()
      recorder.start();
      chunkStartedAtRef.current = performance.now();
      quietSinceRef.current = null;
      return recorder;
    },
    [sendChunk],
  );

  /**
   * Rotate the recorder: stop the current one (which flushes a complete
   * blob via ondataavailable) and immediately start a new one on the
   * same MediaStream. The gap is < 1 ms — negligible for transcription.
   */
  const rotateRecorder = useCallback(() => {
    const stream = streamRef.current;
    const current = mediaRecorderRef.current;
    if (!stream || isStoppingRef.current) return;

    // Stop the current recorder → fires ondataavailable with a full blob
    if (current && current.state === "recording") {
      current.stop();
    }

    // Start a fresh recorder on the same stream
    mediaRecorderRef.current = createRecorder(stream);
  }, [createRecorder]);
  rotateRef.current = rotateRecorder;

  /** Item 12: Start audio level monitoring using AnalyserNode */
  const startLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        // Compute average level 0-100
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 255) * 100 * 2)); // boost sensitivity
        setAudioLevel(normalized);

        // What decides whether a chunk holds speech is the energy in the speech band alone (300 to 3400 Hz),
        // not the average over every frequency. Most of the spectrum is empty above 4 kHz, so the all-bin
        // average sat low even for clear speech and a floor set against it threw real answers away: the page
        // then reported "nothing was recorded" for a candidate who had spoken.
        const binHz = ctx.sampleRate / analyser.fftSize;
        const lo = Math.max(1, Math.floor(300 / binHz));
        const hi = Math.min(dataArray.length - 1, Math.ceil(3400 / binHz));
        let band = 0;
        for (let i = lo; i <= hi; i++) band += dataArray[i];
        const speechLevel = Math.min(100, Math.round((band / (hi - lo + 1) / 255) * 100 * 2));

        // Only a context that is actually running can say anything about silence. A suspended one reports
        // zero for everything, and treating that as a measurement dropped every chunk of every answer.
        if (ctx.state === "running") {
          levelObservedRef.current = true;
        } else {
          void ctx.resume().catch(() => {});
        }
        if (speechLevel > peakSinceChunkRef.current) {
          peakSinceChunkRef.current = speechLevel;
        }
        if (speechLevel >= SILENCE_FLOOR) {
          loudReadingsRef.current += 1;
          quietSinceRef.current = null;
        } else if (quietSinceRef.current === null) {
          quietSinceRef.current = performance.now();
        }

        // Cut where the candidate pauses, never on a timer: a fixed cut lands mid-word, and the half-words on
        // either side are what the speech service guesses at. After the minimum length, the next pause is the
        // cut; past the maximum a shorter one will do; with no pause at all the cut is forced as a last resort.
        if (!isStoppingRef.current) {
          const now = performance.now();
          const age = now - chunkStartedAtRef.current;
          const quietFor = quietSinceRef.current === null ? 0 : now - quietSinceRef.current;
          if (
            (age >= MIN_CHUNK_MS && quietFor >= PAUSE_MS) ||
            (age >= MAX_CHUNK_MS && quietFor >= SHORT_PAUSE_MS) ||
            age >= MAX_CHUNK_MS + HARD_CUT_GRACE_MS
          ) {
            rotateRef.current();
          }
        }
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      animFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (err) {
      console.warn("Audio level monitoring not available:", err);
    }
  }, []);

  /** Stop audio level monitoring */
  const stopLevelMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!interviewWsService.connected) {
      console.warn("Attempt to start recording while WS not connected");
    }

    try {
      // The phone's audio, if the candidate chose it and it is still live. A
      // track that has ended — they closed the phone page, or the pairing
      // dropped — is not an input any more, and recording it would produce
      // silence that the candidate has no way to notice until their answer
      // comes back empty. Falling back to the device microphone is the quiet,
      // correct thing to do.
      const external = externalSourceRef.current;
      const externalTrack = external?.getAudioTracks().find((t) => t.readyState === "live");

      let stream: MediaStream;
      if (externalTrack) {
        stream = new MediaStream([externalTrack]);
        ownsStreamRef.current = false;
      } else {
        if (external) {
          console.warn("Paired phone has no live audio track; using this device's microphone");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: MIC_AUDIO_CONSTRAINTS,
        });
        ownsStreamRef.current = true;
        // What the browser really did to this microphone, for whoever is asked why
        // an answer was noisy. Asking is not the same as receiving.
        console.info(describeMicProcessing(micProcessingReport(stream)));
      }

      streamRef.current = stream;
      isStoppingRef.current = false;

      mimeTypeRef.current = MediaRecorder.isTypeSupported(
        APP_CONFIG.AUDIO_CHUNK_MIME_TYPE,
      )
        ? APP_CONFIG.AUDIO_CHUNK_MIME_TYPE
        : "audio/webm";

      // Start the first recorder
      mediaRecorderRef.current = createRecorder(stream);

      sentCountRef.current = 0;
      chunkIndexRef.current = 0;

      // Backstop only, for a browser where level monitoring is unavailable and no pause can be seen: the
      // normal cut happens in the level loop, at a pause.
      chunkTimerRef.current = setInterval(() => {
        if (performance.now() - chunkStartedAtRef.current >= MAX_CHUNK_MS + HARD_CUT_GRACE_MS - 1000) {
          rotateRecorder();
        }
      }, 5000);

      // Item 12: Start audio level monitoring
      startLevelMonitoring(stream);

      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start audio recording:", err);
      throw err;
    }
  }, [createRecorder, rotateRecorder, startLevelMonitoring]);

  /**
   * Stop recording and return a Promise that resolves once the final audio
   * chunk has been flushed and sent to the backend via WebSocket.
   */
  const stopRecording = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      isStoppingRef.current = true;

      // Clear the rotation timer
      if (chunkTimerRef.current) {
        clearInterval(chunkTimerRef.current);
        chunkTimerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        // Override ondataavailable to flush the final chunk, then resolve
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            sendChunk(e.data);
          }
          cleanup();
          resolve();
        };
        recorder.stop();
      } else {
        cleanup();
        resolve();
      }

      function cleanup() {
        // Only tracks this hook opened. The phone's audio track belongs to the
        // WebRTC connection that also carries its camera — stopping it here
        // would kill the second camera feed at the end of the first answer.
        if (ownsStreamRef.current) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
        }
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        stopLevelMonitoring();
      }
    });
  }, [sendChunk, stopLevelMonitoring]);

  const getAudioStream = useCallback(() => streamRef.current, []);

  /**
   * Choose where the next answer is recorded from.
   *
   * Takes effect on the next {@link startRecording}, not mid-answer: swapping
   * the source under a running MediaRecorder would cut the chunk in flight, and
   * the words in it are not recoverable.
   */
  const setExternalAudioSource = useCallback((stream: MediaStream | null) => {
    externalSourceRef.current = stream;
  }, []);

  /** How many chunks have been sent for the answer just recorded. */
  const getSentChunkCount = useCallback(() => sentCountRef.current, []);

  return {
    getSentChunkCount,
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    getAudioStream,
    setExternalAudioSource,
  };
}
