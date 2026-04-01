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

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
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

  return { isPlaying, amplitude, enqueueAudio, stopPlayback, playBrowserTTS };
}
