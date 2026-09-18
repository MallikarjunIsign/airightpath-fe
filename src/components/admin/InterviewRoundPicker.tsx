import { useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, Video } from 'lucide-react';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import type { InterviewRound, InterviewSchedule } from '@/types/interview.types';
import { isPast } from '@/utils/datetime.utils';
import { formatDateTime } from '@/utils/format.utils';

const ROUNDS: InterviewRound[] = ['L2_TECHNICAL', 'L3_BEHAVIORAL'];

/** A candidate who cannot be booked yet, and the attempt that is in the way. */
export interface BlockedCandidate {
  email: string;
  /** Deadline of the outstanding attempt, as the recruiter typed it. */
  deadlineTime: string;
  /** True once they have opened it — not merely been given it. */
  started: boolean;
}

/** Who this round can be booked for, out of the current selection. */
export interface RoundEligibility {
  /** Emails that may be booked now. */
  assignable: string[];
  /** Emails held back by an attempt that is still live. */
  blocked: BlockedCandidate[];
  /** How many of `assignable` have sat this round before. */
  repeats: number;
}

const EMPTY: RoundEligibility = { assignable: [], blocked: [], repeats: 0 };

/**
 * Whether a schedule is still the candidate's to sit.
 *
 * Two things end an attempt: handing it in, or running out of time. Until one of
 * them has happened the interview is live, and booking a second one would put
 * two open invitations for the same round in front of one candidate — with no
 * way for them, or for the reviewer afterwards, to tell which was meant.
 */
function isOutstanding(schedule: InterviewSchedule): boolean {
  if (schedule.attemptStatus === 'COMPLETED') return false;
  return !!schedule.deadlineTime && !isPast(schedule.deadlineTime);
}

/** Work out who a round can be booked for, out of one selection. */
function computeEligibility(
  schedules: InterviewSchedule[],
  emails: string[],
  round: InterviewRound,
): RoundEligibility {
  const assignable: string[] = [];
  const blocked: BlockedCandidate[] = [];
  let repeats = 0;

  for (const email of emails) {
    const key = email.toLowerCase();
    const mine = schedules.filter(
      (s) => (s.round ?? 'L2_TECHNICAL') === round && (s.email ?? '').toLowerCase() === key,
    );

    const live = mine.find(isOutstanding);
    if (live) {
      blocked.push({
        email,
        deadlineTime: live.deadlineTime,
        started: live.attemptStatus === 'IN_PROGRESS',
      });
      continue;
    }

    assignable.push(email);
    if (mine.length > 0) repeats += 1;
  }

  return { assignable, blocked, repeats };
}

/**
 * Choosing which interview to book, and for whom, inside the booking modal.
 *
 * <p>This replaces the standing "Interview rounds" card, which sat above the
 * candidate table on every stage and showed both rounds whether or not anyone
 * was being booked. Booking an interview is the same kind of act as assigning
 * an assessment — pick the people, pick the thing, confirm — so it is asked for
 * in the same place and the same order, rather than occupying the screen
 * permanently.</p>
 *
 * <p>It also enforces the one rule the standing card had no way to: a candidate
 * with a live attempt is not booked again. Re-booking is for an attempt that is
 * finished or out of time, which is exactly what "reassign" should mean.</p>
 */
export function InterviewRoundPicker({
  schedules,
  loading,
  failed,
  onRetry,
  emails,
  round,
  onRoundChange,
  onEligibilityChange,
}: Readonly<{
  /**
   * Every interview booked on this job.
   *
   * Passed in rather than fetched here, so the Interview column on the table and
   * this modal are reading the same list. Two fetches could answer differently
   * and the disagreement would show up as a column saying "pending" beside a
   * modal happily offering to book that round again.
   */
  schedules: InterviewSchedule[];
  loading: boolean;
  /**
   * The list could not be read. The rule cannot be applied without it, and an
   * empty list looks exactly like "nobody has been booked" — the one wrong
   * answer that silently allows the double booking this exists to prevent.
   */
  failed: boolean;
  onRetry: () => void;
  /** The selected candidates, in the order the table holds them. */
  emails: string[];
  round: InterviewRound;
  onRoundChange: (round: InterviewRound) => void;
  /** Reports who would actually be booked, so the page can send only those. */
  onEligibilityChange: (eligibility: RoundEligibility) => void;
}>) {
  const byRound = useMemo(() => {
    return ROUNDS.reduce<Record<InterviewRound, RoundEligibility>>(
      (acc, r) => {
        acc[r] = loading || failed ? EMPTY : computeEligibility(schedules, emails, r);
        return acc;
      },
      {} as Record<InterviewRound, RoundEligibility>,
    );
  }, [schedules, emails, loading, failed]);

  const current = byRound[round];

  useEffect(() => {
    // While the list is loading, or after it failed, nothing is assignable —
    // which keeps Send shut rather than letting it through unchecked.
    onEligibilityChange(loading || failed ? EMPTY : current);
  }, [current, loading, failed, onEligibilityChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-6 text-sm text-[var(--textSecondary)]">
        <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
        Checking existing attempts…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/20">
        <p className="flex items-start gap-2 font-medium text-red-700 dark:text-red-300">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          Could not read this job&rsquo;s existing interviews.
        </p>
        <p className="text-red-600 dark:text-red-400">
          Booking is held back rather than risk giving someone a second live invitation for a round
          they are already sitting.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-red-700 underline dark:text-red-300"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-[var(--text)]">Which round?</p>
        <p className="mt-0.5 text-xs text-[var(--textSecondary)]">
          Each booking is a new attempt with its own deadline, transcript and result. Previous
          attempts are kept and stay visible in Interview Results.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROUNDS.map((r) => {
          const stats = byRound[r];
          const selected = r === round;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onRoundChange(r)}
              aria-pressed={selected}
              className={`rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] bg-[var(--surface1)] hover:border-[var(--primary)]/50'
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-[var(--text)]">
                {stats.repeats > 0 ? (
                  <RotateCcw size={15} className="flex-shrink-0 text-[var(--primary)]" />
                ) : (
                  <Video size={15} className="flex-shrink-0 text-[var(--primary)]" />
                )}
                {INTERVIEW_ROUND_LABELS[r]}
              </span>
              <span className="mt-1.5 block text-xs text-[var(--textSecondary)]">
                {stats.assignable.length} of {emails.length} can be booked
                {stats.repeats > 0 ? ` · ${stats.repeats} would be a re-attempt` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* What the chosen round would actually do. */}
      {current.assignable.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-[var(--surface1)] p-3 text-sm text-[var(--text)]">
          <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-[var(--success)]" />
          <span>
            Booking {INTERVIEW_ROUND_LABELS[round]} for{' '}
            <strong>{current.assignable.length}</strong> candidate
            {current.assignable.length === 1 ? '' : 's'}
            {current.repeats > 0 && (
              <>
                {' '}
                — {current.repeats} of them as a re-attempt, because their last one was finished or
                out of time.
              </>
            )}
          </span>
        </p>
      )}

      {/* Who is held back, and until when. Named rather than counted: an admin
          who is told "1 skipped" has to go and find out which one. */}
      {current.blocked.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <Clock size={15} className="mt-0.5 flex-shrink-0" />
            {current.blocked.length} candidate{current.blocked.length === 1 ? '' : 's'} already{' '}
            {current.blocked.length === 1 ? 'has' : 'have'} this round open and will be skipped
          </p>
          <ul className="space-y-1">
            {current.blocked.map((candidate) => (
              <li key={candidate.email} className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">{candidate.email}</span> —{' '}
                {candidate.started ? 'in progress' : 'not yet attempted'}, due{' '}
                {formatDateTime(candidate.deadlineTime)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            They can be booked again once they hand in, or once that deadline passes.
          </p>
        </div>
      )}

      {current.assignable.length === 0 && current.blocked.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-[var(--textSecondary)]">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
          Nobody in this selection can be booked for {INTERVIEW_ROUND_LABELS[round]} right now.
        </p>
      )}
    </div>
  );
}
