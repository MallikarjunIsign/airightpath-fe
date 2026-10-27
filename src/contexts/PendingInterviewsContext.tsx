import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { interviewService } from '@/services/interview.service';
import type { InterviewSchedule } from '@/types/interview.types';

/**
 * Interviews the signed-in candidate still has to sit.
 *
 * The interview twin of PendingAssessmentsContext, and a context for the same
 * reason: the sidebar dot and the notification bell both need the count, and a
 * hook would have each of them fetch it separately.
 *
 * Candidates only. Admins schedule interviews rather than sit them, so for them
 * this stays empty and never calls the endpoint.
 */
interface PendingInterviewsContextType {
  /** Everything the interviews page still offers a Start button for. */
  pending: InterviewSchedule[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const PendingInterviewsContext = createContext<PendingInterviewsContextType | undefined>(
  undefined
);

/**
 * The same rule the interviews list uses to decide it still shows a Start
 * button — status alone, no deadline arithmetic.
 *
 * Deliberately unlike the assessments badge, which re-checks the deadline: that
 * endpoint returns attended and expired papers too, while `/api/interview/active`
 * has already dropped anything the candidate can no longer sit. Re-filtering
 * here only put the badge out of step with the page, which happened for real:
 * a deadline stamped earlier today still lists with a Start button, and a
 * `deadline >= now` test silently withheld its badge.
 */
function isPending(interview: InterviewSchedule): boolean {
  return interview.attemptStatus !== 'COMPLETED';
}

/** Soonest deadline first; an unparseable one sinks rather than jumping the queue. */
function byDeadline(a: InterviewSchedule, b: InterviewSchedule): number {
  const left = new Date(a.deadlineTime).getTime();
  const right = new Date(b.deadlineTime).getTime();
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  return left - right;
}

export function PendingInterviewsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { hasAnyRole } = useRbac();
  const [pending, setPending] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const isCandidate = isAuthenticated && !hasAnyRole(['ADMIN', 'SUPER_ADMIN']);

  const fetchPending = useCallback(async () => {
    if (!isCandidate || !user?.email) {
      setPending([]);
      return;
    }
    setLoading(true);
    try {
      // Silent: this is background chrome. A failed count is worth no badge,
      // not a red toast on a screen the candidate did not ask to load.
      const res = await interviewService.getActiveInterviews(user.email, { silent: true });
      setPending((res.data ?? []).filter(isPending).sort(byDeadline));
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [isCandidate, user?.email]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Re-check when the tab regains focus, so finishing an interview in another
  // tab — or a deadline passing while this one sat open — clears the badge.
  useEffect(() => {
    if (!isCandidate) return;
    const onFocus = () => fetchPending();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isCandidate, fetchPending]);

  return (
    <PendingInterviewsContext.Provider value={{ pending, loading, refresh: fetchPending }}>
      {children}
    </PendingInterviewsContext.Provider>
  );
}

export function usePendingInterviews() {
  const context = useContext(PendingInterviewsContext);
  if (!context) {
    throw new Error('usePendingInterviews must be used within PendingInterviewsProvider');
  }
  return context;
}
