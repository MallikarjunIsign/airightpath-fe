import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { interviewService } from '@/services/interview.service';
import { buildInterviewStandings } from '@/utils/interview-standing.utils';
import type { InterviewSchedule } from '@/types/interview.types';
import type { CandidateInterviewStanding } from '@/utils/interview-standing.utils';

/**
 * Every interview booked on a job, read once and shared.
 *
 * Two things on the Candidates screen need this list and must agree about it:
 * the Interview column, which reports where each candidate stands, and the
 * booking modal, which refuses to double-book a round that is still live. Two
 * fetches could answer differently — one stale, one fresh — and the disagreement
 * would show up as a column saying "pending" beside a modal offering to book it
 * again.
 *
 * `failed` is reported rather than swallowed: the booking rule cannot be applied
 * without this list, and an empty list looks exactly like "nobody has been
 * booked", which is the one wrong answer that silently allows a double booking.
 */
export function useJobInterviews(jobPrefix: string) {
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  // Starts true where there is a job to read, so the first render reports
  // "loading" rather than an empty list. An empty list is indistinguishable
  // from "nobody is booked", and a consumer that acts on it in that window
  // would wave through the double booking this list exists to prevent.
  const [loading, setLoading] = useState(!!jobPrefix);
  const [failed, setFailed] = useState(false);

  /** Discards a slow load that lands after the job selection moved on. */
  const token = useRef(0);

  const load = useCallback(async () => {
    const mine = ++token.current;
    if (!jobPrefix) {
      setSchedules([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    try {
      // Silent: a job with no interviews yet is a normal state for this column,
      // not an error to put a toast over the page for.
      const res = await interviewService.getResults(jobPrefix, undefined, { silent: true });
      if (mine !== token.current) return;
      setSchedules(res.data ?? []);
    } catch {
      if (mine !== token.current) return;
      setSchedules([]);
      setFailed(true);
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, [jobPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  const standings = useMemo<Map<string, CandidateInterviewStanding>>(
    () => buildInterviewStandings(schedules),
    [schedules],
  );

  return { schedules, standings, loading, failed, reload: load };
}
