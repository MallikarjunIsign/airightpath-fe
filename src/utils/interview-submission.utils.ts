import type { CompletionReason, InterviewSchedule } from '@/types/interview.types';

/**
 * How an interview ended, in the terms a reviewer reads a score in.
 *
 * <p>The same reasoning as the exam side's {@code describeSubmission}: a score
 * of 2/10 means one thing when the candidate answered every question and
 * something else entirely when the interview took itself away after four. The
 * number alone cannot tell those apart, and the interview result screen showed
 * only a bare completion badge — so a reviewer had to infer it from a short
 * transcript and a low score.</p>
 */
export interface InterviewSubmissionSummary {
  /** Whether a person chose to end it, or the system did. */
  mode: 'MANUAL' | 'AUTO';
  label: string;
  tone: 'success' | 'warning' | 'error' | 'info';
  /** What the label means for the score beside it. */
  reason: string;
  startedAt?: string;
  endedAt?: string;
  /** "42 min", or undefined where the timestamps cannot say. */
  durationLabel?: string;
}

/**
 * One table, so the results list and the detail screen cannot disagree.
 *
 * <p>They had a copy each — {@code completionLabel} on one page and
 * {@code getCompletionReasonVariant} on the other — which is two places to
 * update and two chances for the same interview to read differently depending
 * on which screen you opened it from.</p>
 */
const REASONS: Record<CompletionReason, Omit<InterviewSubmissionSummary, 'startedAt' | 'endedAt' | 'durationLabel'>> = {
  NATURAL_COMPLETION: {
    mode: 'MANUAL',
    label: 'Completed',
    tone: 'success',
    reason: 'The interviewer had asked everything it wanted to and closed the interview normally.',
  },
  CANDIDATE_ENDED: {
    mode: 'MANUAL',
    label: 'Ended by candidate',
    tone: 'info',
    reason:
      'The candidate chose to finish. Anything not yet asked was not asked, so read the score against what the transcript covers.',
  },
  EARLY_TERMINATION_POOR_PERFORMANCE: {
    mode: 'AUTO',
    label: 'Ended early — performance',
    tone: 'error',
    reason:
      'The interviewer stopped after repeated skips or very short answers. The candidate was not asked everything, and the early ending is itself part of the assessment.',
  },
  PROCTORING_VIOLATION: {
    mode: 'AUTO',
    label: 'Stopped — proctoring',
    tone: 'error',
    reason:
      'Warnings reached the limit and the interview was ended for the candidate. The score reflects only what was answered before that.',
  },
  TIMEOUT: {
    mode: 'AUTO',
    label: 'Timed out',
    tone: 'warning',
    reason:
      'The interview ran past its time limit and was closed automatically. The transcript may stop mid-answer.',
  },
  MAX_SKIPS: {
    mode: 'AUTO',
    label: 'Ended — too many skips',
    tone: 'warning',
    reason:
      'The candidate skipped consecutive questions and the interview was closed. Little was answered, so there is little to score.',
  },
};

/**
 * Minutes between two timestamps, or undefined when either is missing.
 *
 * <p>A negative span is dropped rather than shown. It means the clocks
 * disagree, and "-3 min" on a results screen reads as a bug in the product
 * rather than what it is.</p>
 */
function durationMinutes(startedAt?: string, endedAt?: string): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round(ms / 60000);
}

/**
 * How this interview ended, or null when there is nothing to say.
 *
 * <p>Null rather than a guess for an interview that was never sat, or one
 * recorded before the completion reason was stored — saying "Completed"
 * because no reason was written would be inventing a fact.</p>
 */
export function describeInterviewSubmission(
  schedule: InterviewSchedule,
): InterviewSubmissionSummary | null {
  const reason = schedule.completionReason;
  if (!reason && !schedule.endedAt) {
    return null;
  }

  const minutes = durationMinutes(schedule.startedAt, schedule.endedAt);
  const durationLabel = minutes === undefined ? undefined : `${minutes} min`;

  if (!reason) {
    // It ended — the timestamp says so — but nothing recorded how.
    return {
      mode: 'MANUAL',
      label: 'Ended',
      tone: 'info',
      reason: 'How this interview ended was not recorded.',
      startedAt: schedule.startedAt,
      endedAt: schedule.endedAt,
      durationLabel,
    };
  }

  return {
    ...REASONS[reason],
    startedAt: schedule.startedAt,
    endedAt: schedule.endedAt,
    durationLabel,
  };
}

/** Short label for a completion reason, for lists with no room for the rest. */
export function interviewCompletionLabel(reason?: CompletionReason): string {
  return reason ? REASONS[reason].label : '--';
}

/** Badge colour for a completion reason. */
export function interviewCompletionTone(
  reason?: CompletionReason,
): 'success' | 'warning' | 'error' | 'info' {
  return reason ? REASONS[reason].tone : 'info';
}
