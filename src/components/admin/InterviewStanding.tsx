import { CalendarClock, CheckCircle2, Clock, Loader2, PlayCircle, TimerOff } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import { formatDateTime } from '@/utils/format.utils';
import type { CandidateInterviewStanding, RoundStanding } from '@/utils/interview-standing.utils';

/** Short round label — "L2", "L3" — because the cell has one line to work in. */
const SHORT_ROUND: Record<string, string> = {
  L2_TECHNICAL: 'L2',
  L3_BEHAVIORAL: 'L3',
};

/** How each state reads, and what it is telling the admin to do about it. */
const STATE_DISPLAY: Record<
  RoundStanding['state'],
  { label: string; variant: 'info' | 'warning' | 'success' | 'error' | 'secondary'; icon: React.ReactNode }
> = {
  pending: {
    label: 'Assigned',
    variant: 'info',
    icon: <CalendarClock size={12} className="flex-shrink-0" />,
  },
  'in-progress': {
    label: 'In progress',
    variant: 'warning',
    icon: <PlayCircle size={12} className="flex-shrink-0" />,
  },
  // Not "missed": nobody has judged the candidate yet, and the only thing this
  // state actually licenses is booking them again.
  expired: {
    label: 'Not sat',
    variant: 'error',
    icon: <TimerOff size={12} className="flex-shrink-0" />,
  },
  completed: {
    label: 'Completed',
    variant: 'success',
    icon: <CheckCircle2 size={12} className="flex-shrink-0" />,
  },
};

function RoundLine({ standing }: Readonly<{ standing: RoundStanding }>) {
  const display = STATE_DISPLAY[standing.state];
  const roundLabel = SHORT_ROUND[standing.round] ?? standing.round;

  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="text-xs font-semibold text-[var(--text)]"
          title={INTERVIEW_ROUND_LABELS[standing.round]}
        >
          {roundLabel}
        </span>

        {/* Attempt count only once it is more than one — "×1" is noise. */}
        {standing.attempts > 1 && (
          <span
            className="text-[10px] font-semibold text-[var(--warning)]"
            title={`Booked ${standing.attempts} times`}
          >
            ×{standing.attempts}
          </span>
        )}

        <Badge variant={display.variant} size="sm">
          <span className="flex items-center gap-1">
            {display.icon}
            {display.label}
          </span>
        </Badge>

        {standing.state === 'completed' && standing.score !== null && (
          <span className="text-xs font-bold text-[var(--text)]">{standing.score}%</span>
        )}

        {/* The verdict, once there is one. PENDING means the evaluation has not
            landed yet, which is not a verdict and is not shown as one. */}
        {standing.state === 'completed' && standing.result && standing.result !== 'PENDING' && (
          <Badge variant={standing.result === 'PASSED' ? 'success' : 'error'} size="sm">
            {standing.result}
          </Badge>
        )}
      </div>

      {/* The deadline, while it is still the thing that matters. Once the
          interview is sat, when it was due is history. */}
      {standing.state !== 'completed' && standing.deadlineTime && (
        <p className="flex items-center gap-1 text-[10px] text-[var(--textTertiary)]">
          <Clock size={10} className="flex-shrink-0" />
          {standing.state === 'expired' ? 'Was due' : 'Due'}{' '}
          {formatDateTime(standing.deadlineTime)}
        </p>
      )}
    </div>
  );
}

/**
 * Where a candidate stands in their interviews, in the width of a table cell.
 *
 * The pipeline stage says "Interview" for a candidate who was booked an hour ago
 * and for one who is halfway through, and "Interview Done" tells you a round
 * finished without saying which one or how it went. An admin could not tell an
 * assigned candidate from a completed one without leaving this screen for
 * Interview Results and matching people up by email.
 */
export function InterviewStanding({
  standing,
  loading,
}: Readonly<{
  standing?: CandidateInterviewStanding;
  /** The schedules are still arriving, so absence isn't reported as fact. */
  loading?: boolean;
}>) {
  if (loading && !standing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--textTertiary)]">
        <Loader2 size={12} className="animate-spin" />
        Loading
      </span>
    );
  }

  if (!standing || standing.rounds.length === 0) {
    return <span className="text-xs text-[var(--textTertiary)]">No interview set</span>;
  }

  return (
    <div className="space-y-1.5">
      {standing.rounds.map((round) => (
        <RoundLine key={round.round} standing={round} />
      ))}
    </div>
  );
}
