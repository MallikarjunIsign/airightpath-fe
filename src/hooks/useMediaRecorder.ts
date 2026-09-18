import { useState, useRef, useCallback } from 'react';

interface UseMediaRecorderOptions {
  mimeType?: string;
  onDataAvailable?: (blob: Blob) => void;
  timeslice?: number;
  /**
   * False opens the stream but records nothing: no MediaRecorder, no chunks,
   * and `stopAndGetBlob` resolves null.
   *
   * The camera is wanted for two unrelated reasons — the recording kept as
   * evidence, and the live frames face detection reads — and a deployment can
   * want the second without the first. Without this the only way to stop
   * recording was to stop opening the camera, which silently took the face
   * check down with it.
   */
  record?: boolean;
}

export function useMediaRecorder(options?: UseMediaRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      chunksRef.current = [];
      setChunks([]);

      // Stream only: the caller wants live frames, not a recording.
      if (options?.record === false) {
        recorderRef.current = null;
        setIsRecording(false);
        return stream;
      }

      const mimeType = options?.mimeType || 'video/webm;codecs=vp9,opus';
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          setChunks((prev) => [...prev, e.data]);
          options?.onDataAvailable?.(e.data);
        }
      };

      recorder.onstop = () => setIsRecording(false);
      recorderRef.current = recorder;
      recorder.start(options?.timeslice);
      setIsRecording(true);
      return stream;
    } catch (err) {
      console.error('Failed to start recording:', err);
      throw err;
    }
  }, [options]);

  const stop = useCallback(() => {
    // Guarded: in stream-only mode there is no recorder, and calling stop() on
    // one that never started throws.
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopAndGetBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        // Also the stream-only path, where there is no recorder at all — the
        // camera still has to be released or its light stays on after the
        // interview ends.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const allChunks = chunksRef.current;
        resolve(
          allChunks.length > 0
            ? new Blob(allChunks, { type: recorder?.mimeType || 'video/webm' })
            : null
        );
        return;
      }

      recorder.onstop = () => {
        setIsRecording(false);
        const allChunks = chunksRef.current;
        resolve(
          allChunks.length > 0
            ? new Blob(allChunks, { type: recorder.mimeType || 'video/webm' })
            : null
        );
      };

      recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    });
  }, []);

  const getBlob = useCallback(() => {
    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: recorderRef.current?.mimeType || 'video/webm' });
  }, [chunks]);

  const reset = useCallback(() => {
    setChunks([]);
    chunksRef.current = [];
  }, []);

  return { isRecording, chunks, start, stop, stopAndGetBlob, getBlob, reset, stream: streamRef.current };
}
