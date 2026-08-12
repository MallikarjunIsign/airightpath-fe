import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import { APP_CONFIG } from '@/config/app.config';
import type { ApiResponse } from '@/types/api.types';
import type { Assessment, AssignAssessmentDto, AssessmentResult, RawQuestion, RawCodingQuestion } from '@/types/assessment.types';
import type { Result } from '@/types/result.types';

export const assessmentService = {
  upload(data: FormData) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.UPLOAD, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  assign(data: AssignAssessmentDto) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.ASSIGN, data, {
      timeout: APP_CONFIG.ASSIGN_TIMEOUT_MS,
    });
  },

  assignMultipart(data: FormData) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.ASSIGN, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: APP_CONFIG.ASSIGN_TIMEOUT_MS,
    });
  },

  assignBlob(data: FormData) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.ASSIGN_BLOB, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: APP_CONFIG.ASSIGN_TIMEOUT_MS,
    });
  },

  getContent(id: number) {
    return api.get<Assessment>(ENDPOINTS.ASSESSMENTS.GET_CONTENT(id));
  },

  /**
   * Assessments the candidate has still to sit.
   *
   * The server filters out anything expired or already attended, so this is the
   * candidate's to-do list and nothing else. To look at a finished attempt use
   * {@link getAllAssessmentsForCandidate} — this one returns an empty list for
   * exactly the assessments a reviewer cares about.
   *
   * `silent` suppresses the global error toast — for background reads like the
   * sidebar/notification badge, where a failure should cost a badge rather than
   * put a red toast on a screen the candidate did not ask to load.
   */
  getCandidateAssessments(email: string, opts?: { silent?: boolean }) {
    return api.get<Assessment[]>(
      ENDPOINTS.ASSESSMENTS.GET_CANDIDATE_ASSESSMENTS(email),
      opts?.silent ? ({ _skipErrorToast: true } as never) : undefined
    );
  },

  /**
   * Every assessment for a candidate, including attended and expired ones.
   *
   * `silent` suppresses the global error toast — for background reads that fan
   * out over a list of candidates, where one failure should cost that row its
   * detail rather than stack a toast per candidate on screen.
   */
  getAllAssessmentsForCandidate(email: string, opts?: { silent?: boolean }) {
    return api.get<Assessment[]>(ENDPOINTS.ASSESSMENTS.GET_ASSESSMENTS, {
      params: { candidateEmail: email },
      _skipErrorToast: opts?.silent,
    });
  },

  submit(assessmentId: number, data: FormData) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.SUBMIT(assessmentId), data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  markAttended(data: { assessmentId: number; candidateEmail: string }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.MARK_ATTENDED, data);
  },

  saveResult(data: AssessmentResult) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.ASSESSMENTS.SAVE_RESULT, data.resultsJson, {
      headers: { 'Content-Type': 'application/json' },
      params: {
        candidateEmail: data.candidateEmail,
        assessmentType: data.assessmentType,
        score: data.score,
        jobPrefix: data.jobPrefix,
      },
    });
  },

  generateQuestions(jobPrefix: string) {
    return api.get<RawQuestion[]>(ENDPOINTS.ASSESSMENTS.GENERATE_QUESTIONS, {
      params: { jobPrefix },
      timeout: APP_CONFIG.AI_GENERATION_TIMEOUT_MS,
    });
  },

  generateCodingQuestions(jobPrefix: string) {
    return api.get<RawCodingQuestion[]>(ENDPOINTS.ASSESSMENTS.GENERATE_CODING_QUESTIONS, {
      params: { jobPrefix },
      timeout: APP_CONFIG.AI_GENERATION_TIMEOUT_MS,
    });
  },

  fetchQuestions(id: number) {
    return api.get<{ assessmentType: string; questions: string; jobPrefix: string }>(
      ENDPOINTS.ASSESSMENTS.FETCH_QUESTIONS(id)
    );
  },

  getResultsByEmailAndJobPrefix(email: string, jobPrefix: string) {
    return api.get<Result[]>(ENDPOINTS.ASSESSMENTS.GET_RESULTS, {
      params: { email, jobPrefix },
    });
  },

  getResultsByJobPrefix(jobPrefix: string) {
    return api.get<Result[]>(ENDPOINTS.ASSESSMENTS.GET_RESULTS_BY_JOB_PREFIX, {
      params: { jobPrefix },
    });
  },
};
