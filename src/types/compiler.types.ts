// ── Request ──────────────────────────────────────────────────────────
export interface CodeSubmissionRequest {
  language: string;
  script: string;
  customInput?: string;
  assessmentId?: number;
  questionId?: number | string;
  userEmail?: string;
  jobPrefix?: string;
  testCases?: TestCaseDTO[];
  createdAt?: string;
}

/**
 * Outcome of a single execution.
 *
 * `PASSED` is the only success. A run with nothing to compare against — a plain
 * Run, or one with custom input — still reports PASSED when it executed cleanly,
 * which is why `passed` cannot be used to decide that case (see below).
 */
export type CodeRunStatus =
  | 'PASSED'
  | 'FAILED'
  | 'COMPILE_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT'
  | 'MEMORY_EXCEEDED'
  | (string & {}); // tolerate statuses added backend-side before this list catches up

// ── Response — matches BE CodeSubmissionResponseDTO ──────────────────
export interface CodeSubmissionResponse {
  id?: number;
  language: string;
  script: string;
  testResults: TestCaseResultDTO[];
  createdAt?: string;
  userEmail?: string;
  questionId?: string;
  /**
   * Graded runs only. `null` for a plain Run or a custom-input run — there is
   * no expected output for those, so there is nothing to be right or wrong
   * about. Never test this for truthiness; read `status` instead.
   */
  passed?: boolean | null;
  status?: CodeRunStatus;
  /**
   * The assessment this run was made against — how a re-sit's runs are told
   * from the original's. Absent on rows recorded before it was returned, which
   * fall back to being placed by time.
   */
  assessmentId?: string | number | null;
}

// ── Individual test result — matches BE TestCaseDTO response ────────
export interface TestCaseResultDTO {
  input: string;
  /** `null` on ungraded runs — it is no longer echoed back from actualOutput. */
  expectedOutput?: string | null;
  actualOutput: string;
  /** See CodeSubmissionResponse.passed — `null` whenever the run was ungraded. */
  passed?: boolean | null;
  status?: CodeRunStatus;
  questionId?: string;
  errorInfo?: CodeErrorInfo;
}

// ── Error details — matches BE CodeErrorInfo ────────────────────────
export interface CodeErrorInfo {
  /**
   * The thrown type, e.g. "NullPointerException". Newer backends send
   * `exception`; `type` is what the original contract called it. Read them
   * through `errorKind()` in utils/compiler.utils.ts rather than directly.
   */
  exception?: string;
  /** @deprecated Superseded by `exception`; still sent by older backends. */
  type?: string;
  line?: number;       // Line number where the error occurred (nullable)
  message: string;     // Short error message
  /** Plain-language suggestion for the candidate, when the backend has one. */
  hint?: string;
  fullTrace?: string;  // Complete raw compiler/runtime output
}

// ── Legacy types kept for backwards compatibility ───────────────────
export interface TestCaseDTO {
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  passed?: boolean;
  isHidden?: boolean;
}

export interface TestCaseResult {
  testCase: TestCaseDTO;
  passed: boolean;
  actualOutput: string;
  executionTime?: number;
}
