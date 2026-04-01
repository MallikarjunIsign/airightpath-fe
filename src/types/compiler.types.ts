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

// ── Response — matches BE CodeSubmissionResponseDTO ──────────────────
export interface CodeSubmissionResponse {
  id?: number;
  language: string;
  script: string;
  testResults: TestCaseResultDTO[];
  createdAt?: string;
  userEmail?: string;
  questionId?: string;
  passed?: boolean;
}

// ── Individual test result — matches BE TestCaseDTO response ────────
export interface TestCaseResultDTO {
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  passed: boolean;
  questionId?: string;
  errorInfo?: CodeErrorInfo;
}

// ── Error details — matches BE CodeErrorInfo ────────────────────────
export interface CodeErrorInfo {
  type: string;        // "CompilationError" | "SyntaxError" | "RuntimeError" etc.
  line?: number;       // Line number where the error occurred (nullable)
  message: string;     // Short error message
  fullTrace: string;   // Complete raw compiler/runtime output
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
