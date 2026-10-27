import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import { APP_CONFIG } from '@/config/app.config';
import type { CodeSubmissionRequest, CodeSubmissionResponse } from '@/types/compiler.types';

export const compilerService = {
  // Waits up to the compile timeout (matches the backend's execution limit) so a
  // long-running compilation isn't aborted early by the default HTTP timeout.
  runCode(data: CodeSubmissionRequest, config?: Record<string, unknown>) {
    return api.post<CodeSubmissionResponse>(ENDPOINTS.COMPILER.RUN, data, {
      timeout: APP_CONFIG.COMPILE_TIMEOUT_MS,
      ...config,
    } as never);
  },

  saveUnattempted(data: { assessmentId: number; candidateEmail: string }) {
    return api.post(ENDPOINTS.COMPILER.SAVE_UNATTEMPTED, data);
  },

  getLatestCode(params: { userEmail: string; jobPrefix: string; questionId: string }) {
    return api.get<{ script: string; language: string }>(ENDPOINTS.COMPILER.RESULTS_CODE, {
      params,
    });
  },

  /** `silent` suppresses the global error toast — see the assessment service. */
  getResultsByJobPrefix(jobPrefix: string, opts?: { silent?: boolean }) {
    return api.get<CodeSubmissionResponse[]>(ENDPOINTS.COMPILER.RESULTS_BY_JOB_PREFIX, {
      params: { jobPrefix },
      _skipErrorToast: opts?.silent,
    });
  },
};
