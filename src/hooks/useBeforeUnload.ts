import { useEffect, useRef } from 'react';

/**
 * Asks the browser to confirm before the page is reloaded, closed, or navigated
 * away from (only full unloads — client-side route changes are unaffected).
 *
 * `shouldWarn` is read at event time rather than passed as a dependency, so the
 * caller can gate on a ref without re-registering the listener.
 *
 * Two browser limits worth knowing before relying on this:
 *  - The dialog copy is fixed by the browser ("Reload site?" / "Leave site?").
 *    Custom text has been ignored since ~2016, so the reason has to be made
 *    clear in the page itself.
 *  - It is a confirmation, not a block. A candidate who clicks through still
 *    reloads, so this deters accidents — it cannot enforce anything.
 */
export function useBeforeUnload(shouldWarn: () => boolean) {
  const shouldWarnRef = useRef(shouldWarn);
  shouldWarnRef.current = shouldWarn;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!shouldWarnRef.current()) return;
      event.preventDefault();
      // Legacy trigger, still required by Safari and older Chrome.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
