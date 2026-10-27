import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  BookOpen,
  Code2,
  ClipboardList,
  AlertTriangle,
  CalendarClock,
  PlayCircle,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { assessmentService } from '@/services/assessment.service';
import { extractApiError } from '@/services/api.service';
import { formatDateTime, formatServerDateTime } from '@/utils/format.utils';
import { RescheduleExamModal } from './RescheduleExamModal';
import {
  orderedAttempts,
  orderedAssessments,
  assessmentForAttempt,
  splitResultsJson,
  examStartedAt,
} from '@/utils/result.utils';
import type { Result } from '@/types/result.types';
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
  return formatServerDateTime([...stamps].sort()[0]);
}

export function CandidateExamAssignments({
  email,
  jobPrefix,
}: Readonly<CandidateExamAssignmentsProps>) {
  const [rounds, setRounds] = useState<Assessment[][]>([]);
  /** The attempt sat on each paper, keyed by assessment id. */
  const [sittings, setSittings] = useState<Map<number, Result>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Assessment | null>(null);
  /** Bumped to re-read after the window has been moved. */
  const [reloads, setReloads] = useState(0);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!email || !jobPrefix) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setRounds([]);
    setSittings(new Map());

    // Silent: this section is context beside the candidate's details, and a
    // failure here should cost the section rather than put a red toast over a
    // modal the admin opened to read something else. The results ride along so
    // each paper can say when it was actually sat; they are optional, and a
    // failure there costs only those two lines.
    Promise.all([
      assessmentService.getAllAssessmentsForCandidate(email, { silent: true }),
      assessmentService.getResultsByEmailAndJobPrefix(email, jobPrefix).catch(() => null),
    ])
      .then(([assessmentsRes, resultsRes]) => {
        if (cancelled) return;
        const mine = orderedAssessments(
          toAssessmentList(assessmentsRes.data).filter((a) => a.jobPrefix === jobPrefix),
        );
        setRounds(groupAssignmentRounds(mine));

        // Results name no assessment, so each attempt is paired with the paper
        // it was sat under by the same rule the result screens use — keeping
        // the two screens from disagreeing about which sitting is which.
        const results = resultsRes?.data ?? [];
        const paired = new Map<number, Result>();
        for (const type of ['APTITUDE', 'CODING'] as const) {
          const papers = mine.filter((a) => a.assessmentType === type);
          orderedAttempts(results, type).forEach((attempt, index) => {
            const paper = assessmentForAttempt(papers, attempt, index);
            if (paper) paired.set(paper.id, attempt);
          });
        }
        setSittings(paired);
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
  }, [email, jobPrefix, reloads]);

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

            {/* One block per paper in the round: what it is, how far the
                candidate got with it, and the window it lives in. */}
            <div className="space-y-2">
              {round.map((assessment) => (
                <PaperRow
                  key={assessment.id}
                  assessment={assessment}
                  sitting={sittings.get(assessment.id)}
                  onReschedule={() => setRescheduling(assessment)}
                />
              ))}
            </div>
          </div>
        ))}

      {rescheduling && (
        <RescheduleExamModal
          assessment={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

/** A labelled moment, or nothing at all when it was never recorded. */
function TimeRow({
  icon,
  label,
  value,
}: Readonly<{ icon: React.ReactNode; label: string; value: string | null }>) {
  if (!value) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--textSecondary)]">
      <span className="text-[var(--textTertiary)]">{icon}</span>
      <span className="text-[var(--textTertiary)]">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </p>
  );
}

/**
 * One assigned paper: its state, its pass mark, the window it can be sat in,
 * and — once it has been — when the candidate actually opened and handed it in.
 *
 * The scheduled window and the real sitting are kept apart on purpose. "Opens
 * 11:10" is what the recruiter arranged; "started 06:45" is what the candidate
 * did, and a recruiter chasing a no-show needs to see that the two are not the
 * same thing.
 */
function PaperRow({
  assessment,
  sitting,
  onReschedule,
}: Readonly<{
  assessment: Assessment;
  sitting?: Result;
  onReschedule: () => void;
}>) {
  const state = assignmentState(assessment);
  const isAptitude = assessment.assessmentType === 'APTITUDE';

  const { submission } = splitResultsJson(sitting?.resultsJson);
  const started = examStartedAt(assessment, sitting?.submittedAt, submission);

  const window =
    assessment.startTime && assessment.deadline
      ? `${formatDateTime(assessment.startTime)} → ${formatDateTime(assessment.deadline)}`
      : null;

  return (
    <div className="rounded-lg border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-2.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {isAptitude ? (
          <BookOpen size={12} style={{ color: 'var(--info)' }} />
        ) : (
          <Code2 size={12} style={{ color: '#a855f7' }} />
        )}
        <span className="text-xs font-semibold text-[var(--text)]">
          {isAptitude ? 'Aptitude' : 'Coding'}
        </span>
        <Badge variant={STATE_VARIANT[state]} size="sm">
          {STATE_LABEL[state]}
        </Badge>
        <span
          className="text-xs text-[var(--textTertiary)]"
          title={
            assessment.passPercentage
              ? undefined
              : 'The standard mark — none was set for this paper'
          }
        >
          pass {passMarkOf(assessment)}%
        </span>

        {/* Only a paper still to be sat can move. Once it is in, the window it
            was sat under is part of the record. */}
        {state !== 'sat' && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto px-2"
            leftIcon={<CalendarClock size={13} />}
            onClick={onReschedule}
          >
            Change window
          </Button>
        )}
      </div>

      <TimeRow icon={<CalendarClock size={12} />} label="Window" value={window} />
      <TimeRow
        icon={<PlayCircle size={12} />}
        label="Started"
        value={started === null ? null : formatServerDateTime(new Date(started).toISOString())}
      />
      <TimeRow
        icon={<Send size={12} />}
        label="Submitted"
        value={sitting?.submittedAt ? formatServerDateTime(sitting.submittedAt) : null}
      />
    </div>
  );
}
