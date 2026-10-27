import { AlarmClock, CheckCircle, Clock, ShieldAlert, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { describeInterviewSubmission } from '@/utils/interview-submission.utils';
import { formatServerDateTime } from '@/utils/format.utils';
import type { InterviewSchedule } from '@/types/interview.types';

/**
 * How an interview ended, stated where its score is read.
 *
 * <p>The exam result screens have carried this for a while; the interview one
 * did not. It showed a bare completion badge and a red banner for exactly one
 * of the six reasons, so a reviewer looking at 2/10 over four questions had to
 * work out from the transcript whether the candidate gave up, the connection
 * died, or the interviewer stopped them — three quite different conclusions
 * about the same number.</p>
 *
 * <p>Deliberately the same shape as the exam card so a reviewer who moves
 * between an aptitude result and an interview result is reading one layout,
 * not two.</p>
 */
export function InterviewSubmissionInfo({
  schedule,
  className = '',
}: Readonly<{ schedule: InterviewSchedule; className?: string }>) {
  const summary = describeInterviewSubmission(schedule);
  // An interview that was never sat has nothing to say here, and saying
  // "Completed" because no reason was recorded would be inventing a fact.
  if (!summary) return null;

  const isAuto = summary.mode === 'AUTO';
  let icon = <CheckCircle size={13} />;
  if (isAuto) icon = summary.tone === 'warning' ? <AlarmClock size={13} /> : <ShieldAlert size={13} />;
  else if (summary.label.startsWith('Ended by')) icon = <UserCheck size={13} />;

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
        Submission
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={summary.tone} size="sm">
          <span className="flex items-center gap-1.5">
            {icon}
            {summary.label}
          </span>
        </Badge>
        {summary.durationLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--textSecondary)]">
            <Clock size={12} />
            {summary.durationLabel}
          </span>
        )}
      </div>

      {/* What the label means for the score sitting next to it. */}
      <p className="break-words text-sm text-[var(--text)]">{summary.reason}</p>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--textTertiary)]">Started</dt>
          <dd className="text-sm text-[var(--textSecondary)]">
            {summary.startedAt ? formatServerDateTime(summary.startedAt) : '--'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--textTertiary)]">Ended</dt>
          <dd className="text-sm text-[var(--textSecondary)]">
            {summary.endedAt ? formatServerDateTime(summary.endedAt) : '--'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
