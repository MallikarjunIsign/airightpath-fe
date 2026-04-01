import { useState, useRef, useCallback } from 'react';

interface UseScreenRecorderOptions {
  timeslice?: number;
  onScreenStop?: () => void;
}

export function useScreenRecorder(options?: UseScreenRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Keep callback ref fresh so stale closures don't matter
  const onScreenStopRef = useRef(options?.onScreenStop);
  onScreenStopRef.current = options?.onScreenStop;

  const start = useCallback(async (): Promise<MediaStream> => {
    // 1. Get screen stream (browser will show the "Choose what to share" dialog)
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 },
      } as MediaTrackConstraints,
      audio: false,
    });
    screenStreamRef.current = screenStream;

    // 2. Get mic audio separately
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = micStream;

    // 3. Combine screen video + mic audio into one stream
    const combinedStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...micStream.getAudioTracks(),
    ]);

    chunksRef.current = [];

    const mimeType = 'video/webm;codecs=vp8,opus';
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: 800_000,
      audioBitsPerSecond: 64_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => setIsRecording(false);

    // 4. Fire onScreenStop when candidate stops sharing (browser stop button)
    screenStream.getVideoTracks().forEach((track) => {
      track.onended = () => onScreenStopRef.current?.();
    });

    recorderRef.current = recorder;
    recorder.start(options?.timeslice);
    setIsRecording(true);
    return combinedStream;
  }, [options?.timeslice]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    micStreamRef.current = null;
  }, []);

  const stopAndGetBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
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
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      micStreamRef.current = null;
    });
  }, []);

  return { isRecording, start, stop, stopAndGetBlob };
}
