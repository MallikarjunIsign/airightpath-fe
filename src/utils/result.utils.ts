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
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
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
  const stamp = result.submittedAt ?? result.createdAt;
  const time = stamp ? new Date(stamp).getTime() : Number.NaN;
  return Number.isNaN(time) ? (result.id ?? 0) : time;
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
