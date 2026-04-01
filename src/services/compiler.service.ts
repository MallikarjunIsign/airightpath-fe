import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { CodeSubmissionRequest, CodeSubmissionResponse } from '@/types/compiler.types';

export const compilerService = {
  runCode(data: CodeSubmissionRequest) {
    return api.post<CodeSubmissionResponse>(ENDPOINTS.COMPILER.RUN, data);
  },

  saveUnattempted(data: { assessmentId: number; candidateEmail: string }) {
    return api.post(ENDPOINTS.COMPILER.SAVE_UNATTEMPTED, data);
  },

  getLatestCode(params: { userEmail: string; jobPrefix: string; questionId: string }) {
    return api.get<{ script: string; language: string }>(ENDPOINTS.COMPILER.RESULTS_CODE, {
      params,
    });
  },

  getResultsByJobPrefix(jobPrefix: string) {
    return api.get<CodeSubmissionResponse[]>(ENDPOINTS.COMPILER.RESULTS_BY_JOB_PREFIX, {
      params: { jobPrefix },
    });
  },
};
