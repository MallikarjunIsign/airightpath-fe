import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useFullscreen } from '@/hooks/useFullscreen';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useExamCamera } from '@/hooks/useExamCamera';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';

interface UseExamProctoringOptions {
  /** True while the exam page shows its loading spinner (the <video> isn't mounted yet). */
  loading: boolean;
  /** Called when a proctoring limit is reached; the page performs the actual submit. */
  onAutoSubmit: (reason: string) => void;
}

/**
 * Shared exam proctoring: fullscreen enforcement, tab-switch detection, face/eye
 * detection, and the webcam stream — all config-driven via PROCTORING_CONFIG.
 *
 * The page owns the questions/timer/submit; this owns the proctoring. `begin()`
 * runs the permission sequence (fullscreen → models → camera) during init, and
 * `markActive()` flips counters on once init is done so the initial permission
 * prompts don't register as violations.
 */
export function useExamProctoring({ loading, onAutoSubmit }: UseExamProctoringOptions) {
  const { showToast } = useToast();
  const config = PROCTORING_CONFIG;

  const videoRef = useRef<HTMLVideoElement>(null);
  const proctoringActiveRef = useRef(false);
  const [tabWarnings, setTabWarnings] = useState(0);
  const camera = useExamCamera();

  // Always call the latest onAutoSubmit (the page defines it after this hook runs).
  const onAutoSubmitRef = useRef(onAutoSubmit);
  useEffect(() => {
    onAutoSubmitRef.current = onAutoSubmit;
  });

  const { isFullscreen, enterFullscreen, exitFullscreen, fullscreenExitCount } = useFullscreen({
    onExitAttempt: (count) => {
      showToast(MESSAGES.proctoring.fullscreenExited(count), 'warning');
    },
  });

  usePageVisibility({
    onHidden: () => {
      if (!config.tabSwitch.enabled || !proctoringActiveRef.current) return;
      setTabWarnings((prev) => {
        const next = prev + 1;
        const max = config.tabSwitch.maxBeforeAutoSubmit;
        if (max > 0 && next >= max) {
          onAutoSubmitRef.current('Too many tab switches.');
        } else {
          const counter = max > 0 ? `${next}/${max}` : `${next}`;
          showToast(MESSAGES.proctoring.tabSwitch(counter), 'warning');
        }
        return next;
      });
    },
  });

  const { loadModels, startDetection, stopDetection, warningCount, faceDetected } = useFaceDetection({
    maxWarnings:
      config.eyeDetection.maxBeforeAutoSubmit > 0
        ? config.eyeDetection.maxBeforeAutoSubmit
        : Number.POSITIVE_INFINITY,
    checkIntervalMs: config.eyeDetection.checkIntervalMs,
    onMaxWarnings: () => onAutoSubmitRef.current('Too many face/eye warnings.'),
    onNoFace: () => showToast(MESSAGES.proctoring.faceNotDetected, 'warning'),
    onMultipleFaces: (count) => showToast(MESSAGES.proctoring.multipleFaces(count), 'warning'),
    onLookingAway: (direction) => showToast(MESSAGES.proctoring.lookingAway(direction), 'warning'),
  });

  const totalWarnings = tabWarnings + warningCount + fullscreenExitCount;

  // Acquires the camera (prompts for permission). Attaching the stream to the
  // <video> + starting detection happens in the effect below, once the element
  // is mounted. Reused for the "Enable Camera & Retry" action.
  const setupCamera = useCallback(async () => {
    await camera.start();
  }, [camera]);

  // Attach the live stream to the preview and start face detection once the
  // <video> exists (after loading) and the camera is active.
  useEffect(() => {
    if (loading) return;
    const video = videoRef.current;
    const stream = camera.streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    if (config.eyeDetection.enabled) {
      const begin = () => startDetection(video);
      if (video.readyState >= 1) begin();
      else video.addEventListener('loadedmetadata', begin, { once: true });
    }
  }, [loading, camera.status, camera.streamRef, config.eyeDetection.enabled, startDetection]);

  // Runs the init permission sequence: fullscreen → face models → camera.
  const begin = useCallback(async () => {
    if (config.fullscreen.enabled) await enterFullscreen();
    if (config.eyeDetection.enabled) await loadModels();
    await setupCamera();
  }, [config.fullscreen.enabled, config.eyeDetection.enabled, enterFullscreen, loadModels, setupCamera]);

  // Turns on violation counting (call once the exam is fully initialised).
  const markActive = useCallback(() => {
    proctoringActiveRef.current = true;
  }, []);

  // Release detection loop + camera tracks on unmount.
  useEffect(() => {
    return () => {
      stopDetection();
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    config,
    videoRef,
    camera,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    tabWarnings,
    warningCount,
    fullscreenExitCount,
    totalWarnings,
    faceDetected,
    setupCamera,
    stopDetection,
    begin,
    markActive,
  };
}
