import api from "./api.service";
import { ENDPOINTS } from "@/config/api.endpoints";
import type { ApiResponse } from "@/types/api.types";
import type {
  InterviewSchedule,
  BulkInterviewAssignRequest,
  InterviewStats,
  InterviewRound,
  ProctoringEvent,
} from "@/types/interview.types";

/**
 * Query for the results list and the stats that summarise it.
 *
 * Absent keys rather than empty ones: the server reads an unrecognised `round`
 * as a 400, and `round=` is unrecognised — so an "all rounds" view has to omit
 * the parameter, not send it blank.
 */
function buildResultsParams(jobPrefix?: string, round?: InterviewRound) {
  const params: Record<string, string> = {};
  if (jobPrefix) params.jobPrefix = jobPrefix;
  if (round) params.round = round;
  return Object.keys(params).length > 0 ? params : undefined;
}

export interface VoiceConversationEntryDTO {
  id: number;
  interviewScheduleId: number;
  role: string;
  content: string;
  wordCount?: number;
  wordsPerMinute?: number;
  fillerWordCount?: number;
  confidenceScore?: number;
  speechDurationSeconds?: number;
  codeContent?: string;
  codeLanguage?: string;
  /**
   * What the code printed when the candidate last ran it.
   *
   * Sent to the interviewer model with the answer, so a reviewer who cannot see
   * it is reading a different transcript than the one that was scored.
   */
  codeOutput?: string;
  timestamp: string;
}

/**
 * Suppresses the interceptor's error toast, so a caller that renders its own
 * failure state is not shouted over by a generic one.
 */
interface SilentOpts {
  silent?: boolean;
}

export const interviewService = {
  assignInterview(data: {
    email: string;
    jobPrefix: string;
    deadlineTime: string;
  }) {
    return api.post<ApiResponse<unknown>>(ENDPOINTS.INTERVIEWS.ASSIGN, data);
  },

  assignInterviewBulk(data: BulkInterviewAssignRequest) {
    return api.post<ApiResponse<unknown>>(
      ENDPOINTS.INTERVIEWS.ASSIGN_BULK,
      data,
    );
  },

  getActiveInterviews(email: string) {
    return api.get<InterviewSchedule[]>(ENDPOINTS.INTERVIEWS.GET_ACTIVE, {
      params: { email },
    });
  },

  /** `round` omitted returns every round. */
  getResults(jobPrefix?: string, round?: InterviewRound, opts?: SilentOpts) {
    return api.get<InterviewSchedule[]>(ENDPOINTS.INTERVIEWS.GET_RESULTS, {
      params: buildResultsParams(jobPrefix, round),
      ...(opts?.silent ? { _skipErrorToast: true } : {}),
    } as never);
  },

  getResultDetail(id: number) {
    return api.get<InterviewSchedule>(
      ENDPOINTS.INTERVIEWS.GET_RESULT_DETAIL(id),
    );
  },

  // Item 16: Admin stats
  /**
   * Takes the same filters as {@link getResults} on purpose: the server derives
   * these figures from that very list, so passing a different filter here would
   * put the summary cards out of step with the table they sit above.
   */
  getStats(jobPrefix?: string, round?: InterviewRound) {
    return api.get<InterviewStats>(ENDPOINTS.INTERVIEW_ADMIN.STATS, {
      params: buildResultsParams(jobPrefix, round),
    });
  },

  // Item 16: Get proctoring events
  /**
   * A temporary URL that plays one of an interview's recordings.
   *
   * @param kind 'camera' for the webcam, 'screen' for the shared screen
   */
  getRecordingLink(
    scheduleId: number,
    kind: 'camera' | 'screen',
    disposition: 'inline' | 'attachment' = 'inline',
  ) {
    return api.get<{ url: string; expiresInSeconds: number }>(
      ENDPOINTS.INTERVIEWS.RECORDING_LINK(scheduleId),
      { params: { kind, disposition } },
    );
  },

  getProctoringEvents(scheduleId: number) {
    return api.get<ProctoringEvent[]>(
      ENDPOINTS.INTERVIEW_ADMIN.PROCTORING_EVENTS(scheduleId),
    );
  },

  // Item 16: Get conversation transcript
  getConversation(scheduleId: number) {
    return api.get<VoiceConversationEntryDTO[]>(
      ENDPOINTS.INTERVIEW_ADMIN.CONVERSATION(scheduleId),
    );
  },

  verifyRoom(token: string, photo: File) {
    const formData = new FormData();
    formData.append("photo", photo);
    return api.post<{ valid: boolean }>(
      `/api/mobile/verify-room?token=${token}`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
  },
};
