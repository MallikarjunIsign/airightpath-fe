// ── Coding exam configuration ────────────────────────────────────────
// Driven by Vite env vars (see .env.development / .env.production) so the rule
// can be changed per environment WITHOUT code changes — same approach as
// proctoring.config.ts.
//
// Env vars (all optional — defaults applied):
//   VITE_CODING_TESTCASE_VISIBILITY   "locked" | "open" | "partial"  (default locked)
//   VITE_CODING_TESTCASE_OPEN_COUNT   integer >= 0                   (default 0 = use ratio)
//   VITE_CODING_TESTCASE_OPEN_RATIO   0..1                           (default 0.5 = half)

const env = import.meta.env;

/**
 * Who gets to see a test case's input and expected output during the exam.
 *
 *  locked  — nothing is revealed until that case passes. Strictest: a candidate
 *            cannot read the tests off a failing run and hard-code answers.
 *  open    — every case shows its input, expected output and the candidate's
 *            own output, pass or fail. Most helpful for debugging; assumes the
 *            paper is not reused, since the whole test set is readable.
 *  partial — the first few cases are open from the start (the "samples") and
 *            the rest stay locked until they pass. The candidate can always see
 *            enough to debug the shape of the problem without being handed the
 *            cases they are actually graded on.
 *
 * A case that has passed is revealed under every mode — there is nothing left
 * to protect once the candidate's code satisfies it.
 */
export type TestCaseVisibility = 'locked' | 'open' | 'partial';

const VISIBILITY_VALUES: TestCaseVisibility[] = ['locked', 'open', 'partial'];

function parseVisibility(value: unknown, fallback: TestCaseVisibility): TestCaseVisibility {
  const v = String(value ?? '').trim().toLowerCase();
  // "half" reads more naturally than "partial" in a config file; accept both.
  if (v === 'half') return 'partial';
  return (VISIBILITY_VALUES as string[]).includes(v) ? (v as TestCaseVisibility) : fallback;
}

/** Parse a non-negative integer env string, falling back on invalid input. */
function parseCount(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Parse a 0..1 fraction, falling back on anything outside that range. */
function parseRatio(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export const CODING_EXAM_CONFIG = {
  testCases: {
    visibility: parseVisibility(env.VITE_CODING_TESTCASE_VISIBILITY, 'locked'),
    /**
     * `partial` only: how many cases are open regardless of their outcome.
     * 0 means "work it out from the ratio" — a fixed count is for papers where
     * the first two cases are deliberately the worked examples.
     */
    openCount: parseCount(env.VITE_CODING_TESTCASE_OPEN_COUNT, 0),
    /**
     * `partial` only, when no count is set: the fraction of cases open from the
     * start, rounded DOWN. Half of 5 cases is 2 open and 3 locked — rounding up
     * would reveal more of the graded set than the setting promises.
     */
    openRatio: parseRatio(env.VITE_CODING_TESTCASE_OPEN_RATIO, 0.5),
  },
} as const;

export type CodingExamConfig = typeof CODING_EXAM_CONFIG;

/**
 * How many of `total` cases are open from the start under the current mode.
 *
 * Exported so the UI can say "3 of 6 hidden" rather than making the candidate
 * count the padlocks.
 */
export function openTestCaseCount(total: number): number {
  const { visibility, openCount, openRatio } = CODING_EXAM_CONFIG.testCases;
  if (total <= 0) return 0;
  if (visibility === 'open') return total;
  if (visibility === 'locked') return 0;
  if (openCount > 0) return Math.min(openCount, total);
  return Math.min(total, Math.floor(total * openRatio));
}

/**
 * Does this case show its input and expected output?
 *
 * Passing always reveals; beyond that it is the mode that decides. Position is
 * taken from the order the compiler returns the cases in, which is the order
 * they are stored on the paper — so "the first two are open" means the same two
 * for every candidate.
 */
export function isTestCaseRevealed(params: {
  index: number;
  passed: boolean;
  total: number;
}): boolean {
  const { index, passed, total } = params;
  if (passed) return true;
  return index < openTestCaseCount(total);
}
