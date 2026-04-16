import api from "./api.service";
import { ENDPOINTS } from "@/config/api.endpoints";
import type { ApiResponse } from "@/types/api.types";
import type {
  InterviewSchedule,
  BulkInterviewAssignRequest,
  InterviewStats,
  ProctoringEvent,
} from "@/types/interview.types";

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
  timestamp: string;
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

  getResults(jobPrefix?: string) {
    return api.get<InterviewSchedule[]>(ENDPOINTS.INTERVIEWS.GET_RESULTS, {
      params: jobPrefix ? { jobPrefix } : undefined,
    });
  },

  getResultDetail(id: number) {
    return api.get<InterviewSchedule>(
      ENDPOINTS.INTERVIEWS.GET_RESULT_DETAIL(id),
    );
  },

  // Item 16: Admin stats
  getStats(jobPrefix?: string) {
    return api.get<InterviewStats>(ENDPOINTS.INTERVIEW_ADMIN.STATS, {
      params: jobPrefix ? { jobPrefix } : undefined,
    });
  },

  // Item 16: Get proctoring events
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
