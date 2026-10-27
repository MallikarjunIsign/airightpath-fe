import { useEffect, useState } from 'react';

/**
 * The current time, re-read on an interval.
 *
 * For screens whose state turns over on a clock rather than on a user action —
 * an exam that opens at 18:00, a deadline that passes. Without a ticking value
 * the component renders once with whatever `new Date()` said at mount, so a
 * candidate sitting on the page at 17:59 still sees a locked exam at 18:01 and
 * has to guess that a refresh is what they need.
 *
 * @param intervalMs how often to re-read the clock; 30s by default, which is
 *   close enough for minute-precision windows without waking the page often.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
