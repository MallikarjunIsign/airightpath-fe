/**
 * Shared maths for the assessment result views: difficulty banding, coding-row
 * merging and the summary totals the admin/candidate result pages both quote.
 * Kept free of JSX so the numbers stay testable and identical everywhere.
 */
import type { RawCodingQuestion, RawQuestion } from '@/types/assessment.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';
import type { AptitudeAnswer, CodingAnswer, Result, SubmissionMeta } from '@/types/result.types';
import { isSkeletonCode } from './code.utils';
import { isGraded, isPassed } from './compiler.utils';

// ── Shared display helpers ─────────────────────────────────────────────

/** CSS variable for a 0-100 score — green ≥80, amber ≥60, else red. */
/**
 * Colour for a score dial.
 *
 * A recorded verdict wins over the bands. The 80/60 split is a generic
 * "how good is this number" heuristic and has nothing to do with the pass mark
 * the exam was actually graded against — so a module that PASSED on 45% was
 * drawn red directly beside its own green PASSED badge, telling the reviewer
 * two opposite things about the same result.
 *
 * The bands remain the fallback for scores with no verdict attached.
 */
export function scoreColor(score: number, status?: string): string {
  if (status === 'PASSED') return 'var(--success)';
  if (status === 'FAILED') return 'var(--error)';
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--error)';
}

export function statusVariant(status?: string): 'success' | 'error' | 'warning' {
  if (status === 'PASSED') return 'success';
  if (status === 'FAILED') return 'error';
  return 'warning';
}

/**
 * Human duration between two ISO timestamps — used for the exam window.
 * Returns null when either end is missing or the range is inverted.
 */
export function formatDurationBetween(start?: string, end?: string): string | null {
  const from = parseStamp(start);
  const to = parseStamp(end);
  if (from === null || to === null) return null;
  const ms = to - from;
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins ? `${hours} h ${remMins} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days} d ${remHours} h` : `${days} d`;
}

// ── Submission record ──────────────────────────────────────────────────

/** Present and true on the `resultsJson` entry that describes the submission. */
export const SUBMISSION_META_FLAG = '__submissionMeta';

function isSubmissionMeta(entry: unknown): entry is SubmissionMeta {
  return (
    !!entry &&
    typeof entry === 'object' &&
    (entry as Record<string, unknown>)[SUBMISSION_META_FLAG] === true
  );
}

/**
 * The one way to read a stored `resultsJson`.
 *
 * The array holds one entry per question plus, since the exam started recording
 * it, a final entry describing how the attempt ended. Splitting here rather than
 * at each call site is what keeps the metadata from being scored as a question —
 * an extra "answer" would shift both the answer counts and the coding paper's
 * length check, which is the difference between 6 questions and 7.
 *
 * Results submitted before this existed simply have no submission entry, and
 * every screen falls back to what it showed then.
 */
export function splitResultsJson<T>(raw: unknown): { answers: T[]; submission?: SubmissionMeta } {
  const parsed = parseJsonArray<unknown>(raw);
  const answers: T[] = [];
  let submission: SubmissionMeta | undefined;

  for (const entry of parsed) {
    if (isSubmissionMeta(entry)) submission = entry;
    else answers.push(entry as T);
  }

  return { answers, submission };
}

/** Best-effort parse of a JSON string (or an already-parsed array) into an array. */
export function parseJsonArray<T>(raw: unknown): T[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** The entry an exam page appends to its answers when it submits. */
export function buildSubmissionMeta(input: {
  /** The auto-submit reason, or undefined when the candidate pressed Submit. */
  reason?: string;
  secondsLeft?: number;
  durationSeconds?: number;
}): SubmissionMeta {
  return {
    __submissionMeta: true,
    mode: input.reason ? 'AUTO' : 'MANUAL',
    ...(input.reason ? { reason: input.reason } : {}),
    submittedAt: new Date().toISOString(),
    ...(Number.isFinite(input.secondsLeft) ? { secondsLeft: input.secondsLeft } : {}),
    ...(Number.isFinite(input.durationSeconds) && (input.durationSeconds ?? 0) > 0
      ? { durationSeconds: input.durationSeconds }
      : {}),
  };
}

/** "45 min", "1 h 5 min", "40 s" — for durations quoted beside a result. */
export function formatSecondsDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--';
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  return remMins ? `${hours} h ${remMins} min` : `${hours} h`;
}

export interface SubmissionSummary {
  mode: 'MANUAL' | 'AUTO';
  /** Headline, e.g. "Auto-submitted — proctoring". */
  label: string;
  tone: 'success' | 'warning' | 'error';
  /** The auto-submit reason as the candidate saw it, when there was one. */
  reason?: string;
  /** ISO timestamp — the server's, unless only the client's was recorded. */
  submittedAt?: string;
  /** "20 min left" — how much of the exam clock was unused. */
  timeLeftLabel?: string;
  /** "25 min of 45 min" — how long the attempt actually took. */
  timeSpentLabel?: string;
}

/** True when the exam ended itself because the clock ran out, not on a violation. */
function isTimeExpiry(reason?: string): boolean {
  return /time/i.test(reason ?? '');
}

/**
 * Everything a result screen needs to say about how an attempt ended.
 *
 * Returns null only when there is nothing at all to show — no recorded
 * submission and no timestamp — so older results stay silent rather than
 * claiming a manual submit that was never recorded.
 */
export function describeSubmission(
  meta?: SubmissionMeta,
  /** The server's timestamp. It wins: the client clock can be set to anything. */
  serverSubmittedAt?: string,
): SubmissionSummary | null {
  const submittedAt = serverSubmittedAt ?? meta?.submittedAt;
  if (!meta) {
    if (!submittedAt) return null;
    // Pre-dates the recording: the time is known, the manner is not.
    return { mode: 'MANUAL', label: 'Submitted', tone: 'success', submittedAt };
  }

  const auto = meta.mode === 'AUTO';
  const timeUp = auto && isTimeExpiry(meta.reason);

  let label = 'Submitted by candidate';
  if (timeUp) label = 'Auto-submitted — time expired';
  else if (auto) label = 'Auto-submitted — proctoring';

  let tone: SubmissionSummary['tone'] = 'success';
  if (timeUp) tone = 'warning';
  else if (auto) tone = 'error';

  const { secondsLeft, durationSeconds } = meta;
  const hasLeft = Number.isFinite(secondsLeft);
  const hasDuration = Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0;

  let timeSpentLabel: string | undefined;
  if (hasLeft && hasDuration) {
    const spent = Math.max(0, (durationSeconds as number) - (secondsLeft as number));
    timeSpentLabel = `${formatSecondsDuration(spent)} of ${formatSecondsDuration(durationSeconds as number)}`;
  }

  return {
    mode: meta.mode,
    label,
    tone,
    reason: meta.reason,
    submittedAt,
    timeLeftLabel: hasLeft ? `${formatSecondsDuration(secondsLeft as number)} left` : undefined,
    timeSpentLabel,
  };
}

// ── Outcome vocabulary ─────────────────────────────────────────────────

/** Every result surface grades a question one of three ways. */
export type Outcome = 'pass' | 'fail' | 'skip';

export const OUTCOME: Record<
  Outcome,
  { color: string; bg: string; aptitudeLabel: string; codingLabel: string }
> = {
  pass: {
    color: 'var(--success)',
    bg: 'var(--successMuted, rgba(16,185,129,0.12))',
    aptitudeLabel: 'Pass',
    codingLabel: 'Pass',
  },
  fail: {
    color: 'var(--error)',
    bg: 'var(--errorMuted, rgba(239,68,68,0.12))',
    aptitudeLabel: 'Fail',
    codingLabel: 'Fail',
  },
  skip: {
    color: 'var(--warning)',
    bg: 'var(--warningMuted, rgba(245,158,11,0.12))',
    aptitudeLabel: 'Not answered',
    codingLabel: 'Not attempted',
  },
};

/** Grade a single answer: right → pass, wrong → fail, nothing selected → skip. */
export function answerOutcome(correct: boolean | undefined, answered: boolean): Outcome {
  if (correct) return 'pass';
  return answered ? 'fail' : 'skip';
}

// ── Difficulty bands ───────────────────────────────────────────────────

/** Canonical bands, in the order the summary cards show them. */
export const BAND_ORDER = ['Basic', 'Intermediate', 'Advanced'] as const;

/** Question papers word difficulty inconsistently — fold the variants together. */
const BAND_ALIASES: Record<string, string> = {
  easy: 'Basic',
  basic: 'Basic',
  beginner: 'Basic',
  simple: 'Basic',
  low: 'Basic',
  medium: 'Intermediate',
  intermediate: 'Intermediate',
  moderate: 'Intermediate',
  hard: 'Advanced',
  advanced: 'Advanced',
  difficult: 'Advanced',
  expert: 'Advanced',
  complex: 'Advanced',
  high: 'Advanced',
};

export function normalizeBand(raw?: string): string {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return 'General';
  return BAND_ALIASES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function bandRank(name: string): number {
  const i = (BAND_ORDER as readonly string[]).indexOf(name);
  return i === -1 ? BAND_ORDER.length : i;
}

function byBandOrder<T extends { name: string }>(a: T, b: T): number {
  return bandRank(a.name) - bandRank(b.name) || a.name.localeCompare(b.name);
}

// ── Aptitude ───────────────────────────────────────────────────────────

export interface AptitudeBandItem {
  /** Position in the flat question list — lets a chip scroll to its question. */
  index: number;
  number: number;
  correct: boolean;
  answered: boolean;
}

export interface AptitudeBand {
  name: string;
  total: number;
  correct: number;
  answered: number;
  /** Correct answers as a percentage of the band's questions. */
  pct: number;
  items: AptitudeBandItem[];
}

export function isAnswered(q: AptitudeAnswer): boolean {
  return (q.selectedAnswer ?? '').toString().trim() !== '';
}

export function groupAptitudeByBand(questions: AptitudeAnswer[]): AptitudeBand[] {
  const bands = new Map<string, AptitudeBand>();

  questions.forEach((q, index) => {
    const name = normalizeBand(q.Difficulty || q.category);
    if (!bands.has(name)) {
      bands.set(name, { name, total: 0, correct: 0, answered: 0, pct: 0, items: [] });
    }
    const band = bands.get(name)!;
    const answered = isAnswered(q);
    band.total++;
    if (q.isCorrect) band.correct++;
    if (answered) band.answered++;
    band.items.push({ index, number: index + 1, correct: !!q.isCorrect, answered });
  });

  return Array.from(bands.values())
    .map((b) => ({ ...b, pct: b.total ? Math.round((b.correct / b.total) * 100) : 0 }))
    .sort(byBandOrder);
}

export interface AptitudeSummary {
  total: number;
  correct: number;
  incorrect: number;
  answered: number;
  unanswered: number;
  accuracy: number;
}

export function summarizeAptitude(questions: AptitudeAnswer[]): AptitudeSummary {
  const total = questions.length;
  const correct = questions.filter((q) => q.isCorrect).length;
  const answered = questions.filter(isAnswered).length;
  return {
    total,
    correct,
    incorrect: total - correct,
    answered,
    unanswered: total - answered,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
  };
}

// ── Coding ─────────────────────────────────────────────────────────────

/** One row per question; `sub`/`answer` are absent when that source has nothing. */
export interface CodingRow {
  key: string;
  label: string;
  question?: RawCodingQuestion;
  answer?: CodingAnswer;
  sub?: CodeSubmissionResponse;
}

const idOf = (v: unknown) => (v == null || v === '' ? null : String(v));

/**
 * The code as submitted wins over the last compiler run — the run may predate
 * the candidate's final edits.
 */
export const codeOf = (r: CodingRow) => r.answer?.code?.trim() || r.sub?.script?.trim() || '';

/**
 * Only graded tests count towards a score.
 *
 * The stored submission is whatever the candidate last ran, which may have been
 * a plain Run with no test cases. Those come back with `passed: null` — there
 * was no expected output to compare against — so they are neither passes nor
 * failures and must be excluded rather than counted as failures, which would
 * otherwise drag the pass rate down by one phantom test per question.
 */
export const testsOf = (r: CodingRow) => (r.sub?.testResults ?? []).filter(isGraded);

/**
 * How many test cases this question was worth — the score's denominator.
 *
 * The paper is the authority, not what the candidate happened to run. Counting
 * executed tests instead let unattempted questions vanish from the denominator
 * entirely: someone who opened one question of six, ran its 8 cases and passed
 * 2, scored 2/8 = 25% rather than 2/48 = 4%. Skipping questions must not raise
 * the mark.
 *
 * Executed tests are the fallback for when the paper is unavailable, and the
 * larger of the two wins so a paper that under-reports its own cases can never
 * push the pass rate above 100%.
 */
export const plannedTestCount = (r: CodingRow) => {
  const fromPaper = r.question?.testCases?.length ?? 0;
  return Math.max(fromPaper, testsOf(r).length);
};

export const passedTestCount = (r: CodingRow) => testsOf(r).filter(isPassed).length;

/** Solved = every graded test passed (and at least one ran). */
export const isRowSolved = (r: CodingRow) => {
  const tests = testsOf(r);
  return tests.length > 0 && tests.every(isPassed);
};

/** Attempted = the starter template was actually changed. */
export const isRowAttempted = (r: CodingRow) => !isSkeletonCode(codeOf(r));

/** Solved = all tests green; attempted-but-red = fail; untouched = skip. */
export function codingOutcome(r: CodingRow): Outcome {
  if (isRowSolved(r)) return 'pass';
  return isRowAttempted(r) ? 'fail' : 'skip';
}

export const rowTitle = (r: CodingRow) =>
  r.answer?.title || r.question?.title || `Question ${r.label}`;

export const rowLanguage = (r: CodingRow) => r.answer?.language || r.sub?.language;

/**
 * Merges the three sources that describe a coding attempt:
 *  - the CODING result's `resultsJson` — every question, its title and the code
 *    as it stood at submit time (the only source that lists untouched questions),
 *  - the question paper — the full problem statement and sample I/O,
 *  - the compiler submissions — the test-case results.
 * Whichever of the first two is available defines the list and its order, so a
 * question the candidate never opened still shows up as "Not attempted".
 */
export function buildCodingRows(
  questions: RawCodingQuestion[],
  submissions: CodeSubmissionResponse[],
  answers: CodingAnswer[] = [],
): CodingRow[] {
  const rows: CodingRow[] = [];
  const matched = new Set<CodeSubmissionResponse>();

  type Seed = { id: string | null; answer?: CodingAnswer; question?: RawCodingQuestion };
  let seeds: Seed[];
  if (answers.length > 0) {
    seeds = answers.map((a) => ({ id: idOf(a.questionId), answer: a }));
  } else if (questions.length > 0) {
    seeds = questions.map((q) => ({ id: idOf(q.id), question: q }));
  } else {
    seeds = submissions.map((s) => ({ id: idOf(s.questionId) }));
  }

  seeds.forEach((seed, idx) => {
    const question =
      seed.question ??
      questions.find((q) => idOf(q.id) === seed.id) ??
      (seed.id === null ? questions[idx] : undefined);

    let sub = submissions.find(
      (s) => !matched.has(s) && idOf(s.questionId) !== null && idOf(s.questionId) === seed.id,
    );
    // Older submissions carry no questionId — fall back to paper order.
    if (!sub) {
      const byOrder = submissions[idx];
      if (byOrder && !matched.has(byOrder) && byOrder.questionId == null) sub = byOrder;
    }
    if (sub) matched.add(sub);

    rows.push({
      key: `row-${seed.id ?? idx}`,
      label: seed.id ?? String(idx + 1),
      question,
      answer: seed.answer,
      sub,
    });
  });

  // Anything we could not tie back to a question still gets its own row.
  submissions.forEach((s, idx) => {
    if (matched.has(s)) return;
    rows.push({ key: `sub-${s.questionId ?? idx}`, label: String(s.questionId ?? idx + 1), sub: s });
  });

  return rows;
}

export interface CodingBand {
  name: string;
  rows: CodingRow[];
  solved: number;
  attempted: number;
  testsTotal: number;
  testsPassed: number;
  /** Test cases passed as a percentage of the band's test cases. */
  pct: number;
}

export function groupCodingByBand(rows: CodingRow[]): CodingBand[] {
  const bands = new Map<string, CodingBand>();

  for (const row of rows) {
    const name = normalizeBand(row.question?.Difficulty);
    if (!bands.has(name)) {
      bands.set(name, { name, rows: [], solved: 0, attempted: 0, testsTotal: 0, testsPassed: 0, pct: 0 });
    }
    const band = bands.get(name)!;
    band.rows.push(row);
    if (isRowSolved(row)) band.solved++;
    if (isRowAttempted(row)) band.attempted++;
    band.testsTotal += plannedTestCount(row);
    band.testsPassed += passedTestCount(row);
  }

  return Array.from(bands.values())
    .map((b) => ({ ...b, pct: b.testsTotal ? Math.round((b.testsPassed / b.testsTotal) * 100) : 0 }))
    .sort(byBandOrder);
}

export interface CodingSummary {
  totalQ: number;
  totalTests: number;
  passedTests: number;
  solved: number;
  unsolved: number;
  attempted: number;
  notAttempted: number;
  passRate: number;
}

export function summarizeCoding(rows: CodingRow[]): CodingSummary {
  const totalTests = rows.reduce((s, r) => s + plannedTestCount(r), 0);
  const passedTests = rows.reduce((s, r) => s + passedTestCount(r), 0);
  const solved = rows.filter(isRowSolved).length;
  const attempted = rows.filter(isRowAttempted).length;
  return {
    totalQ: rows.length,
    totalTests,
    passedTests,
    solved,
    unsolved: rows.length - solved,
    attempted,
    notAttempted: rows.length - attempted,
    passRate: totalTests ? Math.round((passedTests / totalTests) * 100) : 0,
  };
}

// ── Scoring ────────────────────────────────────────────────────────────
//
// `Result.score` is NOT a percentage:
//  - APTITUDE stores the raw marks earned (the exam sums `q.marks` per correct
//    answer), so a 19/30 paper arrives as `score: 19`.
//  - CODING stores a literal 0 — the exam has no grader, the verdict lives in
//    the compiler's test-case results.
// Rendering `score` with a "%" therefore under-reports aptitude and zeroes
// coding, which is what made the Overall Score disagree with the module views.
// Everything below converts a module to a real 0-100 percentage, and returns
// null when there is genuinely nothing to score.

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Total marks the paper was out of, when the question paper is available. */
function paperTotalMarks(paper: RawQuestion[], answers: AptitudeAnswer[]): number {
  // Only trust the paper when it lines up with the answered set.
  if (paper.length === 0) return 0;
  if (answers.length > 0 && paper.length !== answers.length) return 0;
  return paper.reduce((sum, q) => sum + (isNumber(q.marks) ? q.marks : 1), 0);
}

/**
 * Aptitude as a percentage, best source first: the backend's own percentage →
 * marks earned over the paper's total → correct answers over question count.
 */
export function aptitudeScorePercent(
  result?: Result,
  answers: AptitudeAnswer[] = [],
  paper: RawQuestion[] = [],
): number | null {
  if (!result) return null;

  if (isNumber(result.percentage)) return clampPercent(result.percentage);

  const earned = isNumber(result.score) ? result.score : 0;
  const totalMarks =
    isNumber(result.totalMarks) && result.totalMarks > 0
      ? result.totalMarks
      : paperTotalMarks(paper, answers);
  if (totalMarks > 0) return clampPercent((earned / totalMarks) * 100);

  // No marks denominator anywhere — fall back to the answer sheet.
  if (answers.length > 0) {
    const correct = answers.filter((a) => a.isCorrect).length;
    return clampPercent((correct / answers.length) * 100);
  }

  return null;
}

/**
 * Coding as a percentage. The exam submits `score: 0`, so unless the backend
 * starts sending a real percentage this is the test-case pass rate — the same
 * number the coding module shows, which keeps the two consistent.
 */
export function codingScorePercent(rows: CodingRow[], result?: Result): number | null {
  if (result && isNumber(result.percentage)) return clampPercent(result.percentage);

  if (
    result &&
    isNumber(result.totalMarks) &&
    result.totalMarks > 0 &&
    isNumber(result.score) &&
    result.score > 0
  ) {
    return clampPercent((result.score / result.totalMarks) * 100);
  }

  const { totalTests, passedTests } = summarizeCoding(rows);
  if (totalTests > 0) return clampPercent((passedTests / totalTests) * 100);

  return null;
}

/** Mean of the modules that actually have a score; null when none do. */
export function overallScorePercent(parts: (number | null | undefined)[]): number | null {
  const values = parts.filter(isNumber);
  if (values.length === 0) return null;
  return clampPercent(values.reduce((a, b) => a + b, 0) / values.length);
}

// ── Attempts ───────────────────────────────────────────────────────────

/**
 * When an attempt happened, for ordering. Falls back through the timestamps a
 * result might carry and finally to its id, which is monotonic — the API
 * returns results unordered, so without this "the latest attempt" would mean
 * whatever the database felt like returning last.
 */
function attemptOrder(result: Result): number {
  const time = parseStamp(result.submittedAt ?? result.createdAt);
  return time === null ? (result.id ?? 0) : time;
}

/**
 * Every attempt at one module, oldest first — so index 0 is attempt 1, the
 * paper the candidate sat first, and the last entry is the most recent.
 *
 * Re-assigning an exam creates a second result rather than replacing the first,
 * and both are real. Screens that show a single figure should show the latest;
 * none of them should pick one by array position, which is how the list and the
 * detail page came to disagree about the same candidate.
 */
export function orderedAttempts(
  results: Result[],
  type: 'APTITUDE' | 'CODING',
): Result[] {
  return results
    .filter((r) => r.assessmentType === type)
    .sort((a, b) => attemptOrder(a) - attemptOrder(b));
}

/**
 * The assessment record side of an attempt — the paper that was handed over,
 * its window, and the id the proctoring captures are filed under.
 *
 * Structural rather than the full `Assessment` so the maths here stays free of
 * the API types.
 */
export interface AttemptAssessment {
  id: number;
  assignedAt?: string;
  startTime?: string;
}

/**
 * When the candidate was given this paper; null when the record cannot say.
 *
 * `assignedAt`, not `startTime`. Both sit on the assessment, but they are not
 * the same clock: `assignedAt` is stamped by the server, in UTC, which is the
 * clock a result's `submittedAt` is also on — while `startTime` is the
 * wall-clock the admin typed into the scheduler and is stored exactly as typed.
 *
 * Reading `startTime` first compared a typed 11:10 against a submission of
 * 08:12 UTC and concluded the paper had been handed over after the attempt that
 * sat it. The re-sit then matched nothing, fell back to the paper before it, and
 * was rendered with the previous attempt's questions, sample input/output and
 * test cases — and scored on that attempt's code runs, so both attempts showed
 * the same result.
 */
function assignedTime(a: AttemptAssessment): number | null {
  return parseStamp(a.assignedAt) ?? parseStamp(a.startTime);
}

/**
 * Assessment records oldest first, so index 0 is the paper assigned first —
 * the same ordering `orderedAttempts` gives the results.
 */
export function orderedAssessments<T extends AttemptAssessment>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ta = assignedTime(a);
    const tb = assignedTime(b);
    if (ta !== null && tb !== null) return ta - tb;
    return a.id - b.id;
  });
}

/**
 * The assessment one attempt was sat under.
 *
 * A re-assigned exam gets its own assessment record, with its own question
 * paper, its own window and its own captures. Reading the first record of the
 * type — which is what a `.find()` does — pinned every attempt to the paper the
 * candidate sat first, so switching to attempt 2 changed the score but left the
 * paper, the exam window and the identity photo showing attempt 1.
 *
 * Matched by time rather than by position: the paper an attempt was sat under
 * is the last one handed over at or before it was submitted, which stays right
 * when an assigned paper was never sat and the two lists are different lengths.
 * `index` is the positional fallback for results with no usable timestamp, and
 * -1 there means "the latest", as everywhere else on the result screens.
 */
export function assessmentForAttempt<T extends AttemptAssessment>(
  ordered: T[],
  attempt: Result | undefined,
  index: number,
): T | undefined {
  if (ordered.length <= 1) return ordered[0];

  // Read through parseStamp, like the assessment side of this comparison. The
  // two are compared against each other, so parsing one bare stamp as local and
  // the other as UTC put them a whole timezone apart: on an IST machine the
  // attempt looked 5½ hours earlier than it was, no assessment qualified as
  // "assigned at or before it", and the attempt fell back to the paper before —
  // which is how a re-sit came to show the first attempt's questions, sample
  // input/output and test cases.
  const sat = parseStamp(attempt?.submittedAt ?? attempt?.createdAt);
  if (sat !== null) {
    let match: T | undefined;
    for (const assessment of ordered) {
      const assigned = assignedTime(assessment);
      if (assigned === null || assigned > sat) break;
      match = assessment;
    }
    if (match) return match;
  }

  return ordered[index] ?? ordered[ordered.length - 1];
}

/**
 * The stretch of time one attempt occupied, as epoch milliseconds.
 *
 * `null` at either end means unbounded — nothing before the first attempt, and
 * nothing after one that was never submitted.
 */
export interface AttemptWindow {
  /** Exclusive: the moment the previous attempt went in. */
  from: number | null;
  /** Inclusive: the moment this attempt went in. */
  to: number | null;
}

/**
 * A stored timestamp as epoch milliseconds, or null when it says nothing.
 *
 * The API mixes two spellings of the same instant. The server serialises its
 * `LocalDateTime` columns bare — `2026-08-14T08:23:27.592148` — while anything
 * the browser recorded arrives as `2026-08-14T08:23:29.657Z`. Both are UTC: a
 * result's own submission time and the meta the exam page wrote alongside it
 * land within seconds of each other.
 *
 * `new Date()` does not know that. It reads the bare form as *local* time, so
 * on an IST machine the two spellings sit 5½ hours apart, and comparing one
 * against the other pushed an attempt's own code runs outside its own window —
 * the first attempt then reported none of its test results. Anything with no
 * zone is read as UTC, which is what it is.
 */
export function parseStamp(stamp?: string | null): number | null {
  if (!stamp) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp}Z`;
  const time = new Date(zoned).getTime();
  return Number.isNaN(time) ? null : time;
}

/** An attempt's own timestamp, or null when it carries nothing usable. */
export function attemptTime(attempt?: Result): number | null {
  return parseStamp(attempt?.submittedAt ?? attempt?.createdAt);
}

/**
 * When one attempt was live: after the previous attempt went in, up to and
 * including its own submission.
 *
 * Read off the results rather than the assessment records deliberately. A
 * re-assignment may or may not create a second assessment row depending on the
 * backend, but it always creates a second result — so this is the one boundary
 * that exists in every case, and it is the same boundary the attempt picker
 * shows the reviewer.
 *
 * Everything an attempt produced — its code runs, its pre-exam captures —
 * happened inside this window, because it all precedes the submission that ends
 * it. A single attempt has no boundary to draw and returns an open window.
 */
export function attemptWindow(attempts: Result[], selected?: Result): AttemptWindow {
  const open: AttemptWindow = { from: null, to: null };
  if (attempts.length <= 1 || !selected) return open;

  const at = attempts.findIndex((a) => a.id === selected.id);
  if (at < 0) return open;

  // The latest attempt is left open above. Nothing can belong to an attempt
  // that does not exist yet, and an open end keeps a run recorded a moment
  // after the submit it belongs to — or one still being made, on an attempt not
  // yet handed in — inside the attempt that produced it.
  const isLatest = at === attempts.length - 1;

  return {
    from: attemptTime(attempts[at - 1]),
    to: isLatest ? null : (attemptTime(attempts[at]) ?? attemptTime(attempts[at + 1])),
  };
}

/**
 * Did something recorded at `stamp` happen during this attempt?
 *
 * Anything undatable counts as inside. It cannot be placed, and hiding it would
 * silently drop a code run or a photo that is on file — the reviewer is better
 * served seeing it than being told it does not exist.
 */
export function isWithinAttempt(stamp: string | undefined | null, window: AttemptWindow): boolean {
  if (window.from === null && window.to === null) return true;
  const made = parseStamp(stamp);
  if (made === null) return true;
  if (window.from !== null && made <= window.from) return false;
  return !(window.to !== null && made > window.to);
}

/**
 * The items belonging to one attempt, out of everything on file for the
 * candidate — code runs, pre-exam captures, anything filed per sitting.
 *
 * Two signals, and both are needed:
 *
 *  - The assessment an item was filed against. Exact, and immune to clocks. But
 *    it only separates attempts when each sitting has its own assessment row;
 *    where two sittings share one, every item carries the same id.
 *  - When it happened. Separates sittings under a shared id, and rescues items
 *    filed against a record this screen resolved differently. Weaker: an item's
 *    timestamp comes from the candidate's browser while the attempt's comes from
 *    the server, so the two are not the same clock and a boundary comparison can
 *    land the wrong side.
 *
 * So the id narrows first and time narrows within it, and neither is allowed to
 * return nothing on its own: when the id matches items but none of them sit in
 * the window, the id is trusted and the clock is not. Returning empty means the
 * candidate really has nothing from this attempt — which the caller states,
 * rather than showing another sitting's work.
 */
export function pickForAttempt<T>(
  items: T[],
  assessmentId: number | string | undefined,
  window: AttemptWindow,
  read: {
    assessmentIdOf: (item: T) => string | number | null | undefined;
    timeOf: (item: T) => string | null | undefined;
  },
): T[] {
  const filed =
    assessmentId === undefined
      ? []
      : items.filter((item) => {
          const own = read.assessmentIdOf(item);
          return own != null && String(own) === String(assessmentId);
        });

  const pool = filed.length > 0 ? filed : items;

  if (window.from === null && window.to === null) return pool;

  const inWindow = pool.filter((item) => isWithinAttempt(read.timeOf(item), window));
  if (inWindow.length > 0) return inWindow;

  // The clock disagrees with the filing. The filing wins.
  return filed;
}

/**
 * The code runs belonging to one attempt.
 *
 * Runs are fetched per job, so a re-sit's arrive in the same list as the
 * original's with the same question ids. Split by {@link pickForAttempt}: the
 * assessment the run was filed against, narrowed by when it was made.
 *
 * A single attempt has nothing to separate and keeps the list untouched.
 */
export function submissionsForAttempt(
  submissions: CodeSubmissionResponse[],
  attempts: Result[],
  selected?: Result,
  assessmentId?: number,
): CodeSubmissionResponse[] {
  if (attempts.length <= 1) return submissions;

  return pickForAttempt(submissions, assessmentId, attemptWindow(attempts, selected), {
    assessmentIdOf: (sub) => sub.assessmentId,
    timeOf: (sub) => sub.createdAt,
  });
}

/**
 * Splits a candidate's work on one job into rounds — an "attempt" as a reviewer
 * counts them, rather than as one module counts them.
 *
 * A round is everything that happened before a module came round a second time:
 * an aptitude paper and a coding paper handed over together are one attempt, and
 * re-assigning coding alone opens a second attempt holding only coding. Ordered
 * by time first, so a module added a day later joins the round already in
 * progress instead of starting one of its own.
 *
 * Deliberately shape-agnostic: results and assessment records are grouped the
 * same way on the result screen and the candidate pipeline, and they must agree
 * on what "attempt 2" means.
 */
export function groupRounds<T>(
  items: T[],
  typeOf: (item: T) => string,
  timeOf: (item: T) => number | null,
): T[][] {
  const ordered = items
    .map((item, position) => ({ item, position, at: timeOf(item) }))
    .sort((a, b) => {
      // Undated entries sort last and keep their original order — they cannot
      // be placed in time, and guessing would reshuffle real rounds around them.
      if (a.at === null && b.at === null) return a.position - b.position;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return a.at === b.at ? a.position - b.position : a.at - b.at;
    });

  const rounds: T[][] = [];
  let current: T[] = [];
  let seen = new Set<string>();

  for (const { item } of ordered) {
    const type = typeOf(item);
    if (seen.has(type)) {
      rounds.push(current);
      current = [];
      seen = new Set<string>();
    }
    seen.add(type);
    current.push(item);
  }
  if (current.length > 0) rounds.push(current);

  return rounds;
}

/**
 * When the candidate actually opened the paper.
 *
 * Prefers the server's own stamp, taken as the exam page reports the paper
 * attended. Attempts sat before that was recorded fall back to working
 * backwards from the submission: the exam page writes down how long the clock
 * ran and how much was left on it, and the difference is how long the candidate
 * was in the paper. Null when neither is available — better silent than a
 * start time invented from a duration nobody recorded.
 */
export function examStartedAt(
  assessment?: { examStartedAt?: string | null },
  submittedAt?: string | null,
  meta?: SubmissionMeta,
): number | null {
  const stamped = parseStamp(assessment?.examStartedAt);
  if (stamped !== null) return stamped;

  const submitted = parseStamp(submittedAt);
  const duration = meta?.durationSeconds;
  const left = meta?.secondsLeft;
  if (submitted === null || !isNumber(duration) || duration <= 0 || !isNumber(left)) return null;

  const spentMs = Math.max(0, duration - left) * 1000;
  return submitted - spentMs;
}

// ── Pass marks ─────────────────────────────────────────────────────────

/** Applied to any paper assigned before the pass mark was configurable. */
export const DEFAULT_PASS_PERCENTAGE = 60;

/**
 * The pass mark for a paper. Out-of-range values fall back to the default
 * rather than being clamped: a stored 0 or 300 is a data fault, and quietly
 * turning it into a paper nobody can fail (or nobody can pass) is worse than
 * grading to the standard everything else uses.
 */
export function passMarkOf(assessment?: { passPercentage?: number } | null): number {
  const configured = assessment?.passPercentage;
  if (!isNumber(configured) || configured <= 0 || configured > 100) {
    return DEFAULT_PASS_PERCENTAGE;
  }
  return configured;
}

/**
 * Pass or fail for one module, judged on its percentage against its own mark.
 *
 * The stored `Result.status` is deliberately not consulted. It was written by
 * comparing raw marks to a hardcoded 50, so a 17-out-of-20 aptitude paper was
 * recorded FAILED and every coding paper failed on a literal score of 0 — the
 * verdict contradicted the percentage printed beside it. Deriving it here means
 * historic results are re-graded correctly on read, and every screen agrees.
 */
export function moduleVerdict(
  percent: number | null | undefined,
  passMark: number = DEFAULT_PASS_PERCENTAGE,
): 'PASSED' | 'FAILED' | null {
  if (!isNumber(percent)) return null;
  return percent >= passMark ? 'PASSED' : 'FAILED';
}

/**
 * The candidate's overall verdict.
 *
 * The overall percentage is what is judged, against the strictest bar any of
 * their papers set — passing a 40% coding paper should not carry a 75% aptitude
 * bar it never met. Null while no module has been scored, which is "pending"
 * rather than a failure.
 */
export function overallVerdict(
  overallPercent: number | null | undefined,
  passMarks: number[],
): 'PASSED' | 'FAILED' | null {
  if (!isNumber(overallPercent)) return null;
  const bar = passMarks.length > 0 ? Math.max(...passMarks) : DEFAULT_PASS_PERCENTAGE;
  return overallPercent >= bar ? 'PASSED' : 'FAILED';
}

/**
 * Bands the candidate is weakest in — anything under `threshold`% of its test
 * cases. Shown as coaching hints next to the coding summary.
 */
export function codingAreasToImprove(bands: CodingBand[], threshold = 60): string[] {
  return bands.filter((b) => b.testsTotal > 0 && b.pct < threshold).map((b) => b.name);
}

/** Same idea for aptitude — bands scoring under `threshold`%. */
export function aptitudeAreasToImprove(bands: AptitudeBand[], threshold = 60): string[] {
  return bands.filter((b) => b.total > 0 && b.pct < threshold).map((b) => b.name);
}
