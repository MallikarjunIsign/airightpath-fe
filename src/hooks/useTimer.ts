import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTimerOptions {
  initialSeconds: number;
  autoStart?: boolean;
  onExpire?: () => void;
}

/**
 * A countdown to a moment, not a count of ticks.
 *
 * <p>It used to subtract one per {@code setInterval} and trust the result,
 * which is wrong in every case where the interval does not fire once a
 * second — and there are three, all of them routine:</p>
 *
 * <ul>
 *   <li>A backgrounded tab has its timers throttled to about once a minute,
 *       so a candidate who switched away came back to a clock that had barely
 *       moved.</li>
 *   <li>A closed laptop stops firing them altogether. An hour of sleep cost
 *       the clock nothing.</li>
 *   <li>A reload started the countdown again from the top, which made
 *       refreshing the page a way to buy more time.</li>
 * </ul>
 *
 * <p>Now {@link #start} records a deadline and every tick is a fresh
 * subtraction from the wall clock, so the display can be stale but never
 * wrong, and it is right again the instant the tab wakes. {@code startAt}
 * takes a deadline the server chose, which is what makes it survive a
 * reload: the browser is told when the interview ends rather than how long
 * it lasts.</p>
 */
export function useTimer({ initialSeconds, autoStart = false, onExpire }: UseTimerOptions) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  /** Epoch milliseconds the countdown is heading for; null while stopped. */
  const deadlineRef = useRef<number | null>(autoStart ? Date.now() + initialSeconds * 1000 : null);

  /**
   * Expiry fires from its own effect, not from inside the tick.
   *
   * <p>It used to call {@code onExpire} from inside the {@code setSecondsLeft}
   * updater. React is free to run an updater more than once — and does, on
   * every render under StrictMode — so a timer running out could submit an
   * exam twice. An updater has to be a pure function of the previous value;
   * anything that acts on the world belongs here.</p>
   */
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline == null) return;
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    // Immediately as well as on the interval, so waking from a throttled or
    // sleeping tab corrects the display on the next frame rather than a
    // second later.
    tick();
    const interval = setInterval(tick, 500);

    // visibilitychange because the interval itself is what gets throttled:
    // the one event guaranteed to arrive on return is the tab becoming
    // visible again.
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [isRunning]);

  useEffect(() => {
    if (secondsLeft > 0 || !isRunning || expiredRef.current) return;
    expiredRef.current = true;
    setIsRunning(false);
    onExpireRef.current?.();
  }, [secondsLeft, isRunning]);

  /** Start counting down `initialSeconds` — or whatever `reset` last set — from now. */
  const start = useCallback(() => {
    setSecondsLeft((current) => {
      deadlineRef.current = Date.now() + current * 1000;
      return current;
    });
    setIsRunning(true);
  }, []);

  /**
   * Start counting down to an instant the server chose.
   *
   * <p>The anchored form. A deadline already in the past expires at once,
   * which is correct: an interview whose time ran out while the candidate was
   * disconnected has run out, and pretending otherwise on reconnect would
   * hand them time the server will not honour.</p>
   */
  const startAt = useCallback((deadlineEpochMs: number) => {
    deadlineRef.current = deadlineEpochMs;
    expiredRef.current = false;
    setSecondsLeft(Math.max(0, Math.ceil((deadlineEpochMs - Date.now()) / 1000)));
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    // The remaining time is kept, not the deadline: resuming should give back
    // what was left rather than what the clock has moved on to.
    deadlineRef.current = null;
    setIsRunning(false);
  }, []);

  const reset = useCallback((newSeconds?: number) => {
    expiredRef.current = false;
    deadlineRef.current = null;
    setSecondsLeft(newSeconds ?? initialSeconds);
    setIsRunning(false);
  }, [initialSeconds]);

  return { secondsLeft, isRunning, isExpired: secondsLeft <= 0, start, startAt, pause, reset };
}
