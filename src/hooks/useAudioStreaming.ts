import { useState, useRef, useCallback } from "react";
import { APP_CONFIG } from "@/config/app.config";
import { interviewWsService } from "@/services/interview-ws.service";

/**
 * Hook for streaming audio chunks to the backend for live transcription.
 *
 * Uses a stop-restart MediaRecorder pattern so that EVERY chunk is a
 * self-contained audio file with full container headers (EBML/WebM).
 * This is critical because Whisper needs valid files — the timeslice
 * approach only puts headers in the first chunk, making subsequent
 * chunks undecodeable.
 */
export function useAudioStreaming() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);
  const mimeTypeRef = useRef<string>("audio/webm");
  const isStoppingRef = useRef(false);

  // Item 12: Audio level analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  /** Send a complete audio blob to the backend via WebSocket. */
  const sendChunk = useCallback((blob: Blob) => {
    if (blob.size === 0 || !interviewWsService.connected) return;

    blob.arrayBuffer().then((buffer) => {
      interviewWsService.sendBinary("audio-chunk", buffer);
      chunkIndexRef.current++;
    });
  }, []);

  /** Create a new MediaRecorder on the given stream and start it. */
  const createRecorder = useCallback(
    (stream: MediaStream): MediaRecorder => {
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeTypeRef.current,
      });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          sendChunk(e.data);
        }
      };

      // start() with no timeslice → records continuously until stop()
      recorder.start();
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      isStoppingRef.current = false;

      mimeTypeRef.current = MediaRecorder.isTypeSupported(
        APP_CONFIG.AUDIO_CHUNK_MIME_TYPE,
      )
        ? APP_CONFIG.AUDIO_CHUNK_MIME_TYPE
        : "audio/webm";

      // Start the first recorder
      mediaRecorderRef.current = createRecorder(stream);

      // Rotate every AUDIO_CHUNK_SECONDS so each blob is a complete file
      chunkTimerRef.current = setInterval(
        rotateRecorder,
        APP_CONFIG.AUDIO_CHUNK_SECONDS * 1000,
      );

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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        chunkIndexRef.current = 0;
        stopLevelMonitoring();
      }
    });
  }, [sendChunk, stopLevelMonitoring]);

  const getAudioStream = useCallback(() => streamRef.current, []);

  return { isRecording, audioLevel, startRecording, stopRecording, getAudioStream };
}
