import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { ApiResponse } from '@/types/api.types';
import type {
  PromptRecord,
  EvaluationCategory,
  InterviewRound,
  EffectiveInterviewTemplate,
  InterviewTemplateRequest,
} from '@/types/interview.types';

interface SilentOpts {
  /** Skip the global error toast (for best-effort/background reads). */
  silent?: boolean;
}

const silentConfig = (opts?: SilentOpts) =>
  opts?.silent ? ({ _skipErrorToast: true } as never) : undefined;

/**
 * The same flag, plus query params, for reads that take both.
 *
 * `silentConfig` returns `undefined` when the caller did not ask for silence,
 * and spreading undefined into an object literal is not something TypeScript
 * allows through a `never` return — hence one helper that always produces an
 * object.
 */
const readConfig = (params?: Record<string, string>, opts?: SilentOpts) =>
  ({
    ...(opts?.silent ? { _skipErrorToast: true } : {}),
    ...(params ? { params } : {}),
  }) as never;

export const promptService = {
  /** All stored prompts for a job. */
  getByJob(jobPrefix: string, opts?: SilentOpts) {
    return api.get<PromptRecord[]>(ENDPOINTS.PROMPTS.GET_BY_JOB(jobPrefix), silentConfig(opts));
  },

  /**
   * Evaluation categories stored for a job.
   *
   * With a `round`, only that round's own list — empty when the round has none,
   * which is how the console tells "scored on the shared list" apart from "has
   * its own list that happens to match".
   */
  getEvaluationCategories(jobPrefix: string, round?: InterviewRound, opts?: SilentOpts) {
    return api.get<EvaluationCategory[]>(
      ENDPOINTS.PROMPTS.GET_EVALUATION_CATEGORIES(jobPrefix),
      readConfig(round ? { round } : undefined, opts),
    );
  },

  /**
   * What a round would actually be scored on, defaults included.
   *
   * A recruiter who has configured nothing still needs to see the categories
   * their candidates are being marked against — an empty editor implies an
   * interview that is not scored, which is not what happens.
   */
  getEffectiveEvaluationCategories(jobPrefix: string, round?: InterviewRound, opts?: SilentOpts) {
    return api.get<EvaluationCategory[]>(
      ENDPOINTS.PROMPTS.GET_EFFECTIVE_EVALUATION_CATEGORIES(jobPrefix),
      readConfig(round ? { round } : undefined, opts),
    );
  },

  /** The question budget and pitch a round's interview runs on. */
  getInterviewTemplate(jobPrefix: string, round?: InterviewRound, opts?: SilentOpts) {
    return api.get<EffectiveInterviewTemplate>(
      ENDPOINTS.PROMPTS.GET_INTERVIEW_TEMPLATE(jobPrefix),
      readConfig(round ? { round } : undefined, opts),
    );
  },

  /** Save a round's budget and pitch. Null numbers mean "use the platform default". */
  saveInterviewTemplate(data: InterviewTemplateRequest, opts?: SilentOpts) {
    return api.post<ApiResponse<unknown>>(
      ENDPOINTS.PROMPTS.SAVE_INTERVIEW_TEMPLATE,
      data,
      silentConfig(opts),
    );
  },

  /**
   * Create/update a single prompt for a job stage.
   *
   * `silent` lets the caller own the failure message — the generic interceptor
   * toast cannot say which of the page's several prompts failed to save.
   */
  save(
    data: { jobPrefix: string; promptType: string; promptStage: string | null; prompt: string },
    opts?: SilentOpts,
  ) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.PROMPTS.SAVE, data, silentConfig(opts));
  },

  /** Create/update the evaluation categories for a job. */
  saveEvaluationCategories(data: {
    jobPrefix: string;
    /** Omit to edit the list shared by every round. */
    round?: InterviewRound;
    categories: EvaluationCategory[];
  }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.PROMPTS.SAVE_EVALUATION_CATEGORIES, data);
  },
};
