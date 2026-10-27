import { useState, useEffect } from 'react';

/** Below this the exam UI has nowhere to put an editor, a webcam and a timer. */
const MIN_EXAM_WIDTH = 1024;

/**
 * Whether this device can actually sit a proctored exam.
 *
 * Two conditions, because either alone is wrong. Width alone would pass a
 * tablet held in landscape, which has no keyboard for the coding editor and
 * cannot hold fullscreen reliably. Pointer alone would pass a desktop browser
 * shrunk to a phone-sized window, where the question and the editor cannot both
 * be on screen. `any-pointer: fine` is true when *some* attached device is a
 * mouse, trackpad or stylus — touchscreen laptops still qualify.
 */
function measure(): boolean {
  if (typeof window === 'undefined') return true;
  const wideEnough = window.innerWidth >= MIN_EXAM_WIDTH;
  const hasPrecisePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  return wideEnough && hasPrecisePointer;
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(measure);

  useEffect(() => {
    // Resize covers rotating a tablet and un-maximising a window; the media
    // query covers plugging a mouse into a touch device mid-session.
    const update = () => setIsDesktop(measure());
    window.addEventListener('resize', update);

    const pointerQuery = window.matchMedia?.('(any-pointer: fine)');
    pointerQuery?.addEventListener('change', update);

    return () => {
      window.removeEventListener('resize', update);
      pointerQuery?.removeEventListener('change', update);
    };
  }, []);

  return isDesktop;
}
