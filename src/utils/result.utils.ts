/**
 * Shared maths for the assessment result views: difficulty banding, coding-row
 * merging and the summary totals the admin/candidate result pages both quote.
 * Kept free of JSX so the numbers stay testable and identical everywhere.
 */
import type { RawCodingQuestion } from '@/types/assessment.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';
import type { AptitudeAnswer, CodingAnswer } from '@/types/result.types';
import { isSkeletonCode } from './code.utils';

// ── Shared display helpers ─────────────────────────────────────────────

/** CSS variable for a 0-100 score — green ≥80, amber ≥60, else red. */
export function scoreColor(score: number): string {
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

export const testsOf = (r: CodingRow) => r.sub?.testResults ?? [];

/** Executed tests when there are any, otherwise what the paper would have run. */
export const plannedTestCount = (r: CodingRow) =>
  r.sub?.testResults?.length ?? r.question?.testCases?.length ?? 0;

export const passedTestCount = (r: CodingRow) => testsOf(r).filter((t) => t.passed).length;

/** Solved = every executed test passed (and at least one ran). */
export const isRowSolved = (r: CodingRow) => {
  const tests = testsOf(r);
  return tests.length > 0 && tests.every((t) => t.passed);
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
