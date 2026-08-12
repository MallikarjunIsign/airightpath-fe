import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useFullscreen } from '@/hooks/useFullscreen';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { useExamCamera } from '@/hooks/useExamCamera';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useMicNoiseLevel } from '@/hooks/useMicNoiseLevel';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';

/** Shortest gap between two "too noisy" toasts. */
const NOISE_WARNING_COOLDOWN_MS = 60_000;

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

  // Confirm before a reload/close once the exam is live. Reloading restarts the
  // paper with a fresh clock, so this is worth guarding even though the browser
  // dialog is only a confirmation the candidate can click through.
  useBeforeUnload(() => proctoringActiveRef.current);

  usePageVisibility({
    onHidden: () => {
      if (!config.tabSwitch.enabled || !proctoringActiveRef.current) return;
      setTabWarnings((prev) => {
        const next = prev + 1;
        const max = config.tabSwitch.maxBeforeAutoSubmit;
        if (max > 0 && next >= max) {
          // With a limit of 1 there was no earlier warning, so "too many" would
          // misdescribe what happened — state the rule instead.
          onAutoSubmitRef.current(
            max === 1 ? 'Switching tabs is not allowed.' : 'Too many tab switches.'
          );
        } else {
          const counter = max > 0 ? `${next}/${max}` : `${next}`;
          showToast(MESSAGES.proctoring.tabSwitch(counter), 'warning');
        }
        return next;
      });
    },
  });

  // ── Room noise ────────────────────────────────────────────────────
  // Warn-only, deliberately. A candidate cannot always control a barking dog or
  // a passing siren, so noise raises the same visible warning as a tab switch
  // but never auto-submits — losing an exam to a neighbour's drill would be
  // punishing the wrong person. It is counted so a reviewer can see it later.
  const [noiseWarnings, setNoiseWarnings] = useState(0);
  const noise = useMicNoiseLevel(config.noise.enabled ? camera.stream : null);
  const lastNoiseWarnAtRef = useRef(0);
  const prevNoiseBandRef = useRef(noise.band);

  useEffect(() => {
    const previous = prevNoiseBandRef.current;
    prevNoiseBandRef.current = noise.band;

    if (!config.noise.enabled || !proctoringActiveRef.current) return;
    // Only the moment it crosses into loud — the band already needs the level
    // sustained for `sustainMs`, so this cannot fire on a cough or a door.
    if (noise.band !== 'loud' || previous === 'loud') return;

    // One warning per minute at most. Sustained noise is a single situation,
    // not a stream of separate offences, and a toast every few seconds would
    // bury the exam under its own alerts.
    const now = Date.now();
    if (now - lastNoiseWarnAtRef.current < NOISE_WARNING_COOLDOWN_MS) return;
    lastNoiseWarnAtRef.current = now;

    setNoiseWarnings((n) => n + 1);
    showToast(MESSAGES.proctoring.tooNoisy, 'warning');
  }, [noise.band, config.noise.enabled, showToast]);

  const { loadModels, startDetection, stopDetection, warningCount, faceDetected, multipleFaces } = useFaceDetection({
    maxWarnings:
      config.eyeDetection.maxBeforeAutoSubmit > 0
        ? config.eyeDetection.maxBeforeAutoSubmit
        : Number.POSITIVE_INFINITY,
    checkIntervalMs: config.eyeDetection.checkIntervalMs,
    // A second person is a serious violation → flag promptly (2 checks ≈ 8s);
    // a brief look-away deserves grace → warn slower (4 checks ≈ 16s).
    multipleFacesConsecutiveFrames: 2,
    noFaceConsecutiveFrames: 4,
    onMaxWarnings: () => onAutoSubmitRef.current('Too many face/eye warnings.'),
    onNoFace: () => showToast(MESSAGES.proctoring.faceNotDetected, 'warning'),
    onMultipleFaces: (count) => showToast(MESSAGES.proctoring.multipleFaces(count), 'warning'),
    onLookingAway: (direction) => showToast(MESSAGES.proctoring.lookingAway(direction), 'warning'),
  });

  const totalWarnings = tabWarnings + warningCount + fullscreenExitCount + noiseWarnings;

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

  // Turns it back off. Call when a submit starts, so the paper being sent isn't
  // itself read as a violation and the reload prompt doesn't block the redirect
  // to results. Re-arm with markActive() if the submit fails and the exam goes on.
  const markInactive = useCallback(() => {
    proctoringActiveRef.current = false;
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
    noiseWarnings,
    /** Live band, so a page can show a "too noisy" indicator as it happens. */
    noiseBand: noise.band,
    totalWarnings,
    faceDetected,
    multipleFaces,
    setupCamera,
    stopDetection,
    begin,
    markActive,
    markInactive,
  };
}
