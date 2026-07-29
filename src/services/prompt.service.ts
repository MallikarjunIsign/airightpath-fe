import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type { PromptRecord, EvaluationCategory } from '@/types/interview.types';

interface SilentOpts {
  /** Skip the global error toast (for best-effort/background reads). */
  silent?: boolean;
}

const silentConfig = (opts?: SilentOpts) =>
  opts?.silent ? ({ _skipErrorToast: true } as never) : undefined;

export const promptService = {
  /** All stored prompts for a job. */
  getByJob(jobPrefix: string, opts?: SilentOpts) {
    return api.get<PromptRecord[]>(ENDPOINTS.PROMPTS.GET_BY_JOB(jobPrefix), silentConfig(opts));
  },

  /** Evaluation categories (weights) configured for a job. */
  getEvaluationCategories(jobPrefix: string, opts?: SilentOpts) {
    return api.get<EvaluationCategory[]>(
      ENDPOINTS.PROMPTS.GET_EVALUATION_CATEGORIES(jobPrefix),
      silentConfig(opts),
    );
  },

  /** Create/update a single prompt for a job stage. */
  save(data: { jobPrefix: string; promptType: string; promptStage: string | null; prompt: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.PROMPTS.SAVE, data);
  },

  /** Create/update the evaluation categories for a job. */
  saveEvaluationCategories(data: { jobPrefix: string; categories: EvaluationCategory[] }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.PROMPTS.SAVE_EVALUATION_CATEGORIES, data);
  },
};
