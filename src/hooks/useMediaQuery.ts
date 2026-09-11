import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query from JavaScript.
 *
 * For the cases where a layout decision cannot be made in CSS alone — a details
 * pane that becomes a dialog, say, where the dialog's open state lives in React.
 * Passing the same query string the Tailwind class implies keeps the two
 * agreeing on one number, instead of a JS threshold quietly drifting away from
 * the breakpoint the classes use.
 *
 * Distinct from {@link import('./useIsDesktop').useIsDesktop}, which answers a
 * different question — whether a device can sit a proctored exam — and folds in
 * a pointer check that has nothing to do with layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.(query).matches ?? false;
  });

  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;

    // Re-read on subscribe: the query may already have changed between the
    // initial render and this effect, and the first value would then be stale.
    setMatches(list.matches);

    const update = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Tailwind's `xl` breakpoint, for layouts that also branch in JavaScript. */
export const XL_QUERY = '(min-width: 1280px)';
