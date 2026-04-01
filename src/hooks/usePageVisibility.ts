import { useState, useEffect, useRef } from 'react';

interface UsePageVisibilityOptions {
  onHidden?: () => void;
  onVisible?: () => void;
  /** Delay in ms before a window blur counts as a switch (avoids false positives). Default: 1000 */
  blurDebounceMs?: number;
}

export function usePageVisibility(options?: UsePageVisibilityOptions) {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [switchCount, setSwitchCount] = useState(0);
  const onHiddenRef = useRef(options?.onHidden);
  const onVisibleRef = useRef(options?.onVisible);
  onHiddenRef.current = options?.onHidden;
  onVisibleRef.current = options?.onVisible;

  const blurDebounceMs = options?.blurDebounceMs ?? 1000;

  useEffect(() => {
    // Track whether we already fired for the current "away" episode
    // to avoid double-counting when both visibilitychange and blur fire.
    let firedForCurrentEpisode = false;
    let blurTimerId: number | null = null;

    const fireHidden = () => {
      if (firedForCurrentEpisode) return;
      firedForCurrentEpisode = true;
      setIsVisible(false);
      setSwitchCount((c) => c + 1);
      onHiddenRef.current?.();
    };

    const fireVisible = () => {
      // Clear any pending blur timer
      if (blurTimerId !== null) {
        clearTimeout(blurTimerId);
        blurTimerId = null;
      }
      firedForCurrentEpisode = false;
      setIsVisible(true);
      onVisibleRef.current?.();
    };

    // Primary: visibilitychange — fires when tab is truly hidden (tab switch, minimize)
    const handleVisibility = () => {
      if (document.hidden) {
        fireHidden();
      } else {
        fireVisible();
      }
    };

    // Secondary: window blur/focus — catches Alt+Tab, Cmd+Tab, clicking other apps
    const handleBlur = () => {
      // Debounce: only count if focus isn't regained within blurDebounceMs.
      // This filters out transient blurs from permission dialogs, fullscreen transitions, etc.
      if (blurTimerId !== null) clearTimeout(blurTimerId);
      blurTimerId = window.setTimeout(() => {
        blurTimerId = null;
        // Only fire if the page is still not focused AND not already counted via visibilitychange
        if (!document.hasFocus()) {
          fireHidden();
        }
      }, blurDebounceMs);
    };

    const handleFocus = () => {
      fireVisible();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      if (blurTimerId !== null) clearTimeout(blurTimerId);
    };
  }, [blurDebounceMs]);

  return { isVisible, switchCount };
}
