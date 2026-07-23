import { useState, useCallback, useEffect, useRef } from 'react';

export type CameraStatus =
  | 'idle' // not requested yet
  | 'requesting' // permission prompt / device warming up
  | 'active' // stream live
  | 'denied' // user blocked permission
  | 'unavailable' // no camera device found
  | 'error'; // other failure (in use, hardware, insecure context)

interface UseExamCameraResult {
  status: CameraStatus;
  /** Human-readable reason for the current non-active status. */
  message: string | null;
  /** Requests the camera. Returns the live stream, or null on failure. */
  start: () => Promise<MediaStream | null>;
  /** Stops all tracks and resets to idle. */
  stop: () => void;
  streamRef: React.MutableRefObject<MediaStream | null>;
}

const STATUS_MESSAGES: Record<Exclude<CameraStatus, 'active' | 'idle'>, string> = {
  requesting: 'Requesting camera access…',
  denied: 'Camera access was blocked. Please allow it in your browser and retry.',
  unavailable: 'No camera device was found. Connect a webcam and retry.',
  error: 'Camera could not be started. It may be in use by another app.',
};

/**
 * Manages the exam camera stream with an explicit, UI-drivable status.
 *
 * Fixes the old silent-failure behaviour where a denied/absent camera left the
 * preview black while the UI still claimed "Camera active". Callers can render a
 * blocking overlay off `status` and re-invoke `start()` to retry.
 */
export function useExamCamera(): UseExamCameraResult {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStatus('idle');
  }, []);

  const start = useCallback(async (): Promise<MediaStream | null> => {
    // Insecure context (non-HTTPS, non-localhost) can't access the camera.
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      return null;
    }

    // Drop any previous stream before re-requesting (retry path).
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      // If the user revokes access or unplugs the camera mid-exam, reflect it.
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (streamRef.current === stream) {
            streamRef.current = null;
            setStatus('denied');
          }
        };
      });

      setStatus('active');
      return stream;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        setStatus('denied');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        setStatus('unavailable');
      } else {
        // NotReadableError (in use), AbortError, etc.
        setStatus('error');
      }
      return null;
    }
  }, []);

  // Ensure tracks are released if the component unmounts.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const message = status === 'active' || status === 'idle' ? null : STATUS_MESSAGES[status];

  return { status, message, start, stop, streamRef };
}
