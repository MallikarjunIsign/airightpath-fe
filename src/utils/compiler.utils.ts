import type {
  CodeErrorInfo,
  CodeRunStatus,
  CodeSubmissionResponse,
  TestCaseResultDTO,
} from '@/types/compiler.types';

/**
 * Reading compiler results.
 *
 * The backend distinguishes "ran fine" from "got the right answer". A plain Run
 * and a custom-input run report `passed: null`, because with no expected output
 * there is nothing to be right or wrong about — only `status` says whether the
 * code executed. Anything that treats `passed` as a boolean therefore reads a
 * clean run as a failure, which is what these helpers exist to prevent.
 */

/** True only for a graded case the candidate actually got right. */
export function isPassed(result: Pick<TestCaseResultDTO, 'passed'>): boolean {
  return result.passed === true;
}

/** True only for a graded case the candidate got wrong — never for an ungraded run. */
export function isFailed(result: Pick<TestCaseResultDTO, 'passed'>): boolean {
  return result.passed === false;
}

/** A case is graded when there was an expected output to compare against. */
export function isGraded(result: TestCaseResultDTO): boolean {
  return result.passed !== null && result.passed !== undefined;
}

/**
 * Whether the run executed cleanly, regardless of correctness.
 *
 * Prefers the response-level status and falls back to the first result's, so it
 * holds whichever level the backend reports it at.
 */
export function runStatus(response: CodeSubmissionResponse): CodeRunStatus | undefined {
  return response.status ?? response.testResults?.[0]?.status;
}

/** True when the code compiled and ran without crashing or timing out. */
export function ranCleanly(response: CodeSubmissionResponse): boolean {
  const status = runStatus(response);
  // Older backends send no status at all; fall back to "no error was attached".
  if (!status) return !response.testResults?.some((r) => r.errorInfo);
  return status === 'PASSED';
}

/** The thrown type, across both the old (`type`) and new (`exception`) field names. */
export function errorKind(errorInfo?: CodeErrorInfo): string {
  return errorInfo?.exception ?? errorInfo?.type ?? 'Error';
}

/** Human label for a status badge. Unknown statuses are title-cased rather than dropped. */
export function statusLabel(status?: CodeRunStatus): string {
  switch (status) {
    case 'PASSED':
      return 'Passed';
    case 'FAILED':
      return 'Wrong answer';
    case 'COMPILE_ERROR':
      return 'Compile error';
    case 'RUNTIME_ERROR':
      return 'Runtime error';
    case 'TIMEOUT':
      return 'Timed out';
    case 'MEMORY_EXCEEDED':
      return 'Out of memory';
    default:
      if (!status) return 'Unknown';
      return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}

/**
 * Tailwind classes for a status badge. A timeout, a crash and a wrong answer
 * are different problems and must not look alike.
 */
export function statusTone(status?: CodeRunStatus): string {
  switch (status) {
    case 'PASSED':
      return 'bg-green-900/50 text-green-400 border-green-800/50';
    case 'FAILED':
      return 'bg-red-900/50 text-red-400 border-red-800/50';
    case 'COMPILE_ERROR':
      return 'bg-red-900/50 text-red-300 border-red-800/50';
    case 'RUNTIME_ERROR':
      return 'bg-orange-900/50 text-orange-400 border-orange-800/50';
    case 'TIMEOUT':
      return 'bg-amber-900/50 text-amber-400 border-amber-800/50';
    case 'MEMORY_EXCEEDED':
      return 'bg-purple-900/50 text-purple-400 border-purple-800/50';
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}
