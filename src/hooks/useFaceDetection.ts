import { useState, useCallback, useRef, useEffect } from 'react';

interface UseFaceDetectionOptions {
  maxWarnings?: number;
  checkIntervalMs?: number;
  lookingAwayThreshold?: number;
  lookingDownThreshold?: number;
  lookingAwayConsecutiveFrames?: number;
  onMaxWarnings?: () => void;
  onNoFace?: () => void;
  onMultipleFaces?: (count: number) => void;
  onLookingAway?: (direction: string) => void;
}

export function useFaceDetection(options?: UseFaceDetectionOptions) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(true);
  const [warningCount, setWarningCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [lookingAway, setLookingAway] = useState(false);
  const [lookingDirection, setLookingDirection] = useState<string | null>(null);
  const [multipleFaces, setMultipleFaces] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const faceApiRef = useRef<typeof import('face-api.js') | null>(null);
  // Ref-based loaded flag to avoid stale closure issues with React state
  const modelsLoadedRef = useRef(false);

  // Consecutive looking-away frame counter
  const lookingAwayCountRef = useRef(0);
  // Prevents repeated warnings during a single sustained look-away episode
  const lookingAwayActiveRef = useRef(false);

  // Consecutive no-face frame counter (require 2+ consecutive frames before warning)
  const noFaceCountRef = useRef(0);
  const noFaceActiveRef = useRef(false);

  // Consecutive multiple-faces frame counter (require 2+ consecutive frames before warning)
  const multipleFacesCountRef = useRef(0);
  const multipleFacesActiveRef = useRef(false);

  const maxWarnings = options?.maxWarnings ?? 3;
  const checkIntervalMs = options?.checkIntervalMs ?? 3000;
  const lookingAwayThreshold = options?.lookingAwayThreshold ?? 0.28;
  const lookingDownThreshold = options?.lookingDownThreshold ?? 0.22;
  const lookingAwayConsecutiveFrames = options?.lookingAwayConsecutiveFrames ?? 2;

  // Stable refs for callbacks
  const onNoFaceRef = useRef(options?.onNoFace);
  onNoFaceRef.current = options?.onNoFace;
  const onMaxWarningsRef = useRef(options?.onMaxWarnings);
  onMaxWarningsRef.current = options?.onMaxWarnings;
  const onMultipleFacesRef = useRef(options?.onMultipleFaces);
  onMultipleFacesRef.current = options?.onMultipleFaces;
  const onLookingAwayRef = useRef(options?.onLookingAway);
  onLookingAwayRef.current = options?.onLookingAway;

  const loadModels = useCallback(async () => {
    try {
      const faceapi = await import('face-api.js');
      faceApiRef.current = faceapi;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      ]);
      modelsLoadedRef.current = true;
      setIsLoaded(true);
    } catch (err) {
      console.error('Failed to load face detection models:', err);
    }
  }, []);

  const addWarning = useCallback(() => {
    setWarningCount((prev) => {
      const next = prev + 1;
      if (next >= maxWarnings) {
        onMaxWarningsRef.current?.();
      }
      return next;
    });
  }, [maxWarnings]);

  const startDetection = useCallback(
    (video: HTMLVideoElement) => {
      videoRef.current = video;
      // Use ref instead of state to avoid stale closure issue
      if (!faceApiRef.current || !modelsLoadedRef.current) return;

      // Wait for video to be ready before starting interval
      const beginDetection = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsChecking(true);
        intervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || !faceApiRef.current) return;
          // Skip if video isn't actively playing
          if (videoRef.current.paused || videoRef.current.readyState < 2) return;

          const faceapi = faceApiRef.current;

          try {
            const detections = await faceapi
              .detectAllFaces(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
              )
              .withFaceLandmarks(true); // true = use tiny model

            if (detections.length === 0) {
              // No face detected — require 2 consecutive frames to avoid flicker
              noFaceCountRef.current += 1;
              setMultipleFaces(false);
              setLookingAway(false);
              setLookingDirection(null);
              lookingAwayCountRef.current = 0;
              lookingAwayActiveRef.current = false;
              multipleFacesCountRef.current = 0;
              multipleFacesActiveRef.current = false;

              if (noFaceCountRef.current >= 2) {
                setFaceDetected(false);

                // Fire callback + add warning once per sustained no-face episode
                if (!noFaceActiveRef.current) {
                  noFaceActiveRef.current = true;
                  onNoFaceRef.current?.();
                  addWarning();
                }
              }
            } else if (detections.length > 1) {
              // Multiple faces — require 2 consecutive frames to avoid flicker
              multipleFacesCountRef.current += 1;
              setFaceDetected(true);
              setLookingAway(false);
              setLookingDirection(null);
              lookingAwayCountRef.current = 0;
              lookingAwayActiveRef.current = false;
              noFaceCountRef.current = 0;
              noFaceActiveRef.current = false;

              if (multipleFacesCountRef.current >= 2) {
                setMultipleFaces(true);

                // Fire callback + add warning once per sustained multiple-faces episode
                if (!multipleFacesActiveRef.current) {
                  multipleFacesActiveRef.current = true;
                  onMultipleFacesRef.current?.(detections.length);
                  addWarning();
                }
              }
            } else {
              // Single face — head pose estimation
              setFaceDetected(true);
              setMultipleFaces(false);
              noFaceCountRef.current = 0;
              noFaceActiveRef.current = false;
              multipleFacesCountRef.current = 0;
              multipleFacesActiveRef.current = false;

              const detection = detections[0];
              const landmarks = detection.landmarks;
              const box = detection.detection.box;

              // Nose tip is landmark index 30
              const noseTip = landmarks.positions[30];
              const faceCenterX = box.x + box.width / 2;
              const faceCenterY = box.y + box.height / 2;

              const horizontalOffset = (noseTip.x - faceCenterX) / box.width;
              const verticalOffset = (noseTip.y - faceCenterY) / box.height;

              let direction: string | null = null;

              if (Math.abs(horizontalOffset) > lookingAwayThreshold) {
                direction = horizontalOffset > 0 ? 'right' : 'left';
              } else if (verticalOffset < -0.22) {
                direction = 'up';
              } else if (verticalOffset > lookingDownThreshold) {
                direction = 'down';
              }

              if (direction) {
                lookingAwayCountRef.current += 1;

                if (lookingAwayCountRef.current >= lookingAwayConsecutiveFrames) {
                  setLookingAway(true);
                  setLookingDirection(direction);

                  // Fire callback + add warning once per sustained episode
                  if (!lookingAwayActiveRef.current) {
                    lookingAwayActiveRef.current = true;
                    onLookingAwayRef.current?.(direction);
                    addWarning();
                  }
                }
              } else {
                // Looking at screen — reset
                lookingAwayCountRef.current = 0;
                lookingAwayActiveRef.current = false;
                setLookingAway(false);
                setLookingDirection(null);
              }
            }
          } catch {
            // Detection error — skip this cycle
          }
        }, checkIntervalMs);
      };

      // If video is already playing, start immediately
      if (video.readyState >= 2 && !video.paused) {
        beginDetection();
      } else {
        // Wait for the video to start playing
        const onPlaying = () => {
          video.removeEventListener('playing', onPlaying);
          beginDetection();
        };
        video.addEventListener('playing', onPlaying);
        // Also try to play the video if it hasn't started
        video.play().catch(() => {
          // Autoplay might be blocked; detection will start when video plays
        });
      }
    },
    [checkIntervalMs, lookingAwayThreshold, lookingDownThreshold, lookingAwayConsecutiveFrames, addWarning]
  );

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsChecking(false);
    lookingAwayCountRef.current = 0;
    lookingAwayActiveRef.current = false;
    noFaceCountRef.current = 0;
    noFaceActiveRef.current = false;
    multipleFacesCountRef.current = 0;
    multipleFacesActiveRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    isLoaded,
    faceDetected,
    warningCount,
    isChecking,
    lookingAway,
    lookingDirection,
    multipleFaces,
    loadModels,
    startDetection,
    stopDetection,
    resetWarnings: () => setWarningCount(0),
  };
}
