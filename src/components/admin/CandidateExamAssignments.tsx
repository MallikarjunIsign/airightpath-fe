import { useState, useEffect } from 'react';
import { Loader2, BookOpen, Code2, ClipboardList, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { assessmentService } from '@/services/assessment.service';
import { extractApiError } from '@/services/api.service';
import { formatDateTime } from '@/utils/format.utils';
import {
  toAssessmentList,
  groupAssignmentRounds,
  assignmentState,
} from '@/utils/assessment.utils';
import { passMarkOf } from '@/utils/result.utils';
import type { Assessment } from '@/types/assessment.types';
import type { AssignmentState } from '@/utils/assessment.utils';

/**
 * What this candidate was actually sent for this job, attempt by attempt.
 *
 * The pipeline stage says a candidate is at "Exam Sent" but not what was sent,
 * and a re-assignment is rarely the whole exam again — the common case is the
 * coding paper alone, a second time. Without this the admin has no way to tell
 * a candidate sitting both papers from one re-sitting coding, short of opening
 * their result.
 *
 * Fetched per candidate when the modal opens rather than for the whole stage:
 * the list is the expensive place to do it, and only one candidate is being
 * looked at.
 */
interface CandidateExamAssignmentsProps {
  email: string;
  /** The job whose assignments to show — a candidate can hold several jobs'. */
  jobPrefix: string;
}

const STATE_LABEL: Record<AssignmentState, string> = {
  sat: 'Sat',
  expired: 'Expired',
  pending: 'Not sat yet',
};

const STATE_VARIANT: Record<AssignmentState, 'success' | 'error' | 'warning'> = {
  sat: 'success',
  expired: 'error',
  pending: 'warning',
};

/** The day a round was sent out, from the first paper handed over in it. */
function roundSentOn(round: Assessment[]): string | null {
  const stamps = round
    .map((a) => a.assignedAt ?? a.startTime)
    .filter((stamp): stamp is string => !!stamp);
  if (stamps.length === 0) return null;
  return formatDateTime([...stamps].sort()[0]);
}

export function CandidateExamAssignments({
  email,
  jobPrefix,
}: Readonly<CandidateExamAssignmentsProps>) {
  const [rounds, setRounds] = useState<Assessment[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email || !jobPrefix) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setRounds([]);

    // Silent: this section is context beside the candidate's details, and a
    // failure here should cost the section rather than put a red toast over a
    // modal the admin opened to read something else.
    assessmentService
      .getAllAssessmentsForCandidate(email, { silent: true })
      .then((res) => {
        if (cancelled) return;
        const mine = toAssessmentList(res.data).filter((a) => a.jobPrefix === jobPrefix);
        setRounds(groupAssignmentRounds(mine));
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [email, jobPrefix]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList size={15} className="text-[var(--textTertiary)]" />
        <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--textTertiary)]">
          Exam assignments
        </h4>
        {rounds.length > 1 && (
          <Badge variant="warning" size="sm">
            {rounds.length} attempts
          </Badge>
        )}
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
          <Loader2 size={14} className="animate-spin" />
          Loading what was assigned…
        </p>
      )}

      {!loading && error && (
        <p className="flex items-start gap-2 text-sm text-[var(--error)]">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          Couldn&apos;t load this candidate&apos;s assignments. {error}
        </p>
      )}

      {!loading && !error && rounds.length === 0 && (
        <p className="text-sm text-[var(--textSecondary)]">
          No assessment has been assigned to this candidate for this job yet.
        </p>
      )}

      {!loading &&
        !error &&
        rounds.map((round, idx) => (
          <div
            key={round.map((a) => a.id).join('-')}
            className="rounded-xl border border-[var(--borderMuted,var(--border))] bg-[var(--surface1)] p-3 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
                Attempt {idx + 1}
                {idx === rounds.length - 1 && rounds.length > 1 && (
                  <span className="ml-1.5 font-medium normal-case tracking-normal text-[var(--textQuaternary)]">
                    (latest)
                  </span>
                )}
              </p>
              <p className="text-xs text-[var(--textSecondary)]">
                {roundSentOn(round) ? `Sent ${roundSentOn(round)}` : 'Send date not recorded'}
              </p>
            </div>

            {/* One chip per paper in the round, so "aptitude and coding" reads
                differently from "coding again". */}
            <div className="flex flex-wrap gap-1.5">
              {round.map((assessment) => {
                const state = assignmentState(assessment);
                const isAptitude = assessment.assessmentType === 'APTITUDE';
                return (
                  <span
                    key={assessment.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] text-xs"
                    title={[
                      `Pass mark ${passMarkOf(assessment)}%${assessment.passPercentage ? '' : ' (standard mark — none was set for this paper)'}`,
                      assessment.deadline
                        ? `Window closes ${formatDateTime(assessment.deadline)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {isAptitude ? (
                      <BookOpen size={12} style={{ color: 'var(--info)' }} />
                    ) : (
                      <Code2 size={12} style={{ color: '#a855f7' }} />
                    )}
                    <span className="font-semibold text-[var(--text)]">
                      {isAptitude ? 'Aptitude' : 'Coding'}
                    </span>
                    <Badge variant={STATE_VARIANT[state]} size="sm">
                      {STATE_LABEL[state]}
                    </Badge>
                    {/* The bar this paper is graded against. Shown per paper
                        because it is set per paper at assign time — and falls
                        back to the standard mark for papers assigned before it
                        was configurable, which is the mark they are actually
                        graded on. */}
                    <span className="text-[var(--textTertiary)]">
                      pass {passMarkOf(assessment)}%
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
