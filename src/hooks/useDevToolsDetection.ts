import { useState, useEffect, useRef } from 'react';
import { APP_CONFIG } from '@/config/app.config';

interface UseDevToolsDetectionOptions {
  onDetected?: (count: number) => void;
}

export function useDevToolsDetection(options?: UseDevToolsDetectionOptions) {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [detectionCount, setDetectionCount] = useState(0);
  const onDetectedRef = useRef(options?.onDetected);
  onDetectedRef.current = options?.onDetected;

  useEffect(() => {
    const interval = window.setInterval(() => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      const open = widthThreshold || heightThreshold;

      setIsDevToolsOpen((prev) => {
        // Only count a new detection when transitioning from closed to open
        if (open && !prev) {
          setDetectionCount((c) => {
            const next = c + 1;
            onDetectedRef.current?.(next);
            return next;
          });
        }
        return open;
      });
    }, APP_CONFIG.DEVTOOLS_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return { isDevToolsOpen, detectionCount };
}
