import { useState, useRef, useCallback, useEffect } from "react";

interface AudioChunk {
  audioData: string; // base64 mp3
  text: string;
  isLast: boolean;
}

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<AudioChunk[]>([]);
  const isProcessingRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  /**
   * The interviewer's voice, as a recordable stream.
   *
   * <p>Recordings captured the microphone and nothing else, so an interview
   * played back as one side of a conversation: a candidate answering
   * questions nobody could hear. The questions survive in the transcript, but
   * a recording of someone responding to silence is close to useless as
   * evidence of how the interview actually went.</p>
   *
   * <p>A second destination hung off the same graph. The speakers keep their
   * own, so tapping this changes nothing about what the candidate hears.</p>
   */
  const recordDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
      // Branched off the same analyser every spoken chunk already passes
      // through, so anything audible is captured without a second code path
      // to keep in step with the first.
      recordDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
      analyserRef.current.connect(recordDestinationRef.current);
    }
    return audioContextRef.current;
  }, []);

  const updateAmplitude = useCallback(() => {
    if (!analyserRef.current || !isPlaying) {
      setAmplitude(0);
      return;
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setAmplitude(Math.min(1, avg / 128));

    animFrameRef.current = requestAnimationFrame(updateAmplitude);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateAmplitude);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updateAmplitude]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;

    isProcessingRef.current = true;
    setIsPlaying(true);

    while (queueRef.current.length > 0) {
      const chunk = queueRef.current.shift()!;

      try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") await ctx.resume();

        const binaryStr = atob(chunk.audioData);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(analyserRef.current!);
          sourceRef.current = source;

          source.onended = () => {
            sourceRef.current = null;
            resolve();
          };

          source.start(0);
        });
      } catch (err) {
        console.error("Error playing audio chunk:", err);
        // Use browser TTS as fallback
        if (chunk.text) {
          await speakWithBrowserTTS(chunk.text);
        }
      }
    }

    isProcessingRef.current = false;
    setIsPlaying(false);
    setAmplitude(0);
  }, [getAudioContext]);

  const enqueueAudio = useCallback(
    (audioData: string, text: string, isLast: boolean) => {
      queueRef.current.push({ audioData, text, isLast });
      processQueue();
    },
    [processQueue],
  );

  const stopPlayback = useCallback(() => {
    queueRef.current = [];
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Already stopped
      }
      sourceRef.current = null;
    }
    isProcessingRef.current = false;
    setIsPlaying(false);
    setAmplitude(0);
  }, []);

  const speakWithBrowserTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }, []);

  const playBrowserTTS = useCallback(
    async (text: string) => {
      setIsPlaying(true);
      await speakWithBrowserTTS(text);
      setIsPlaying(false);
    },
    [speakWithBrowserTTS],
  );

  useEffect(() => {
    return () => {
      stopPlayback();
      try {
        if (
          audioContextRef.current &&
          audioContextRef.current.state !== "closed"
        ) {
          // close() returns a promise; swallow any errors on unmount
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore
      }
    };
  }, [stopPlayback]);

  /**
   * The interviewer's voice for mixing into a recording, or null before any
   * audio has played — the graph is built lazily on the first chunk.
   *
   * <p>Covers only audio played through this graph. Where TTS falls back to
   * the browser's own speech synthesis, the sound goes straight to the
   * operating system and cannot be captured from a web page at all.</p>
   */
  const getInterviewerAudioStream = useCallback(
    () => recordDestinationRef.current?.stream ?? null,
    []
  );

  return {
    isPlaying,
    amplitude,
    enqueueAudio,
    stopPlayback,
    playBrowserTTS,
    getInterviewerAudioStream,
  };
}
