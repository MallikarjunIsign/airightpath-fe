import { AlarmClock, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { describeSubmission } from '@/utils/result.utils';
import type { SubmissionMeta } from '@/types/result.types';

/**
 * How an attempt ended, stated where the score is read.
 *
 * A score of 8% means one thing when the candidate worked the full hour and
 * something else entirely when the exam took itself away after two tab
 * switches with 40 minutes still on the clock. The number alone cannot tell
 * those apart, so every result screen shows this beside it.
 *
 * Renders nothing when neither a submission record nor a timestamp exists —
 * results predating this feature say nothing rather than guessing.
 */
export function SubmissionInfo({
  meta,
  submittedAt,
  className = '',
}: Readonly<{
  meta?: SubmissionMeta;
  /** The server's timestamp, which wins over the client clock in the record. */
  submittedAt?: string;
  className?: string;
}>) {
  const summary = describeSubmission(meta, submittedAt);
  if (!summary) return null;

  const isAuto = summary.mode === 'AUTO';
  let icon = <CheckCircle size={13} />;
  if (isAuto) icon = summary.tone === 'warning' ? <AlarmClock size={13} /> : <ShieldAlert size={13} />;

  const badgeVariant = summary.tone === 'success' ? 'success' : summary.tone;

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
        Submission
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badgeVariant} size="sm">
          <span className="flex items-center gap-1.5">
            {icon}
            {summary.label}
          </span>
        </Badge>
        {summary.timeLeftLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--textSecondary)]">
            <Clock size={12} />
            {summary.timeLeftLabel}
          </span>
        )}
      </div>

      {/* The candidate saw this exact wording when the exam ended. */}
      {summary.reason && (
        <p className="text-sm text-[var(--text)] break-words">{summary.reason}</p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--textTertiary)]">Submitted at</dt>
          <dd className="text-sm text-[var(--textSecondary)]">
            {summary.submittedAt ? formatDateTime(summary.submittedAt) : '--'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--textTertiary)]">Time used</dt>
          <dd className="text-sm text-[var(--textSecondary)]">
            {summary.timeSpentLabel ?? 'Not recorded'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Date and clock time together — "when" here means the minute, not the day. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
