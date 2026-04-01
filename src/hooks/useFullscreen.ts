import { useState, useCallback, useEffect, useRef } from 'react';

interface UseFullscreenOptions {
  onExitAttempt?: (exitCount: number) => void;
}

export function useFullscreen(options?: UseFullscreenOptions) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const intentionalExitRef = useRef(false);
  const onExitAttemptRef = useRef(options?.onExitAttempt);
  onExitAttemptRef.current = options?.onExitAttempt;

  useEffect(() => {
    const handler = () => {
      const nowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(nowFullscreen);

      // If exited fullscreen and it was NOT intentional, count as a warning
      if (!nowFullscreen && !intentionalExitRef.current) {
        setFullscreenExitCount((prev) => {
          const next = prev + 1;
          onExitAttemptRef.current?.(next);
          return next;
        });
      }
      intentionalExitRef.current = false;
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        intentionalExitRef.current = true;
        await document.exitFullscreen();
      }
    } catch {
      // Already exited
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen, fullscreenExitCount };
}
