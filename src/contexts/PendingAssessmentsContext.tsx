import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { assessmentService } from '@/services/assessment.service';
import type { Assessment } from '@/types/assessment.types';

/**
 * Assessments the signed-in candidate still has to sit.
 *
 * Lives in a context rather than a hook because two pieces of chrome need the
 * same answer at once — the sidebar dot and the notification bell — and a hook
 * would have each of them fetch it separately.
 *
 * Candidates only. Admins are assigners, not sitters, so for them this stays
 * empty and never calls the endpoint.
 */
interface PendingAssessmentsContextType {
  /** Not attended, not expired, deadline still ahead — soonest deadline first. */
  pending: Assessment[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const PendingAssessmentsContext = createContext<PendingAssessmentsContextType | undefined>(
  undefined
);

/** The same rule the assessments table uses for its "Pending" badge. */
function isPending(assessment: Assessment, now: number): boolean {
  if (assessment.examAttended || assessment.expired) return false;
  const deadline = new Date(assessment.deadline).getTime();
  // A deadline we cannot parse is not grounds for hiding the exam.
  return Number.isNaN(deadline) || deadline >= now;
}

export function PendingAssessmentsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { hasAnyRole } = useRbac();
  const [pending, setPending] = useState<Assessment[]>([]);
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
      const res = await assessmentService.getCandidateAssessments(user.email, { silent: true });
      const now = Date.now();
      setPending(
        (res.data ?? [])
          .filter((a) => isPending(a, now))
          .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      );
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [isCandidate, user?.email]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Re-check when the tab regains focus, so finishing an exam in another tab —
  // or a deadline passing while this one sat open — clears the badge.
  useEffect(() => {
    if (!isCandidate) return;
    const onFocus = () => fetchPending();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isCandidate, fetchPending]);

  return (
    <PendingAssessmentsContext.Provider value={{ pending, loading, refresh: fetchPending }}>
      {children}
    </PendingAssessmentsContext.Provider>
  );
}

export function usePendingAssessments() {
  const context = useContext(PendingAssessmentsContext);
  if (!context) {
    throw new Error('usePendingAssessments must be used within PendingAssessmentsProvider');
  }
  return context;
}
