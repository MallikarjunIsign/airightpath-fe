/**
 * Exam length is derived, not fixed.
 *
 * Every paper gets a per-question allowance — one minute for an aptitude
 * question, twenty-five for a coding problem by default — and the clock is
 * simply that allowance times the number of questions in the paper. Add five
 * questions to a paper and the exam grows by five minutes on its own; nobody
 * has to remember to edit a duration somewhere else.
 *
 * Admins can override the allowance per assignment on the Assign Assessment
 * screen; when they do, the value travels with the assessment and wins here.
 */

import { APP_CONFIG } from '@/config/app.config';

export type AssessmentType = 'APTITUDE' | 'CODING';

/** The configured default allowance, in minutes, for one question of this type. */
export function defaultMinutesPerQuestion(type: AssessmentType | string | undefined): number {
  return type === 'CODING'
    ? APP_CONFIG.CODING_MINUTES_PER_QUESTION
    : APP_CONFIG.APTITUDE_MINUTES_PER_QUESTION;
}

/** Keeps an admin-entered allowance inside the supported range. */
export function clampMinutesPerQuestion(minutes: number): number {
  const { EXAM_MIN_MINUTES_PER_QUESTION: min, EXAM_MAX_MINUTES_PER_QUESTION: max } = APP_CONFIG;
  if (!Number.isFinite(minutes)) return min;
  return Math.min(Math.max(Math.round(minutes), min), max);
}

/**
 * The question count to price an exam with at assign time: the number read out
 * of the paper, else the one the admin typed for a file we could not parse.
 */
export function effectiveQuestionCount(
  detectedCount: number | null,
  manualCount: string
): number | null {
  if (detectedCount && detectedCount > 0) return detectedCount;
  const typed = Number.parseInt(manualCount, 10);
  return Number.isFinite(typed) && typed > 0 ? typed : null;
}

interface ExamDurationInput {
  type: AssessmentType | string | undefined;
  /** Questions in the paper. Null/0 means "unknown" — see the fallback below. */
  questionCount: number | null | undefined;
  /** Per-question allowance carried by the assessment, when the admin set one. */
  minutesPerQuestion?: number | null;
  /** A whole-exam duration carried by the assessment, which wins outright. */
  durationMinutes?: number | null;
}

/**
 * The exam clock, in minutes.
 *
 * Order of precedence: an explicit whole-exam duration, then per-question time
 * x question count, then the flat APP_CONFIG fallback for the case where the
 * paper could not be counted (so the candidate still gets a working timer
 * rather than a zero-second exam).
 */
export function computeExamMinutes({
  type,
  questionCount,
  minutesPerQuestion,
  durationMinutes,
}: ExamDurationInput): number {
  if (durationMinutes && durationMinutes > 0) return Math.round(durationMinutes);

  const perQuestion =
    minutesPerQuestion && minutesPerQuestion > 0
      ? clampMinutesPerQuestion(minutesPerQuestion)
      : defaultMinutesPerQuestion(type);

  if (questionCount && questionCount > 0) return perQuestion * questionCount;

  return APP_CONFIG.EXAM_TIMER_MINUTES;
}

/** "1 hr 20 min" / "45 min" — for instructions and summary copy. */
export function formatDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
