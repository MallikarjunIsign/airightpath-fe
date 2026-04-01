import { useState, useRef, useCallback } from 'react';
import { aiService } from '@/services/ai.service';
import { APP_CONFIG } from '@/config/app.config';

export function useAudioChunking() {
  const [isRecording, setIsRecording] = useState(false);
  const [fullTranscript, setFullTranscript] = useState('');
  const [currentChunkText, setCurrentChunkText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);

  const processChunk = useCallback(async (blob: Blob) => {
    if (blob.size === 0) return;
    setIsTranscribing(true);
    try {
      const res = await aiService.voiceToText(blob);
      const text = res.data?.text?.trim();
      if (text) {
        setCurrentChunkText(text);
        setFullTranscript((prev) => {
          const base = prev.endsWith(' ') || prev === '' ? prev : prev + ' ';
          return base + text;
        });
      }
    } catch {
      // Silent fail for individual chunk transcription
    } finally {
      setIsTranscribing(false);
      chunkIndexRef.current += 1;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = APP_CONFIG.AUDIO_CHUNK_MIME_TYPE;
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          processChunk(e.data);
        }
      };

      recorder.onstop = () => setIsRecording(false);
      recorderRef.current = recorder;
      chunkIndexRef.current = 0;
      recorder.start(APP_CONFIG.AUDIO_CHUNK_SECONDS * 1000);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start audio chunking:', err);
      throw err;
    }
  }, [processChunk]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setFullTranscript('');
    setCurrentChunkText('');
    chunkIndexRef.current = 0;
  }, []);

  return {
    isRecording,
    fullTranscript,
    currentChunkText,
    isTranscribing,
    start,
    stop,
    reset,
  };
}
