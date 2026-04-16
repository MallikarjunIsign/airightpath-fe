import api from "./api.service";
import { ENDPOINTS } from "@/config/api.endpoints";
import type {
  StartInterviewRequest,
  StartInterviewResponse,
  AnswerQuestionRequest,
  AnswerQuestionResponse,
  VoiceStartResponse,
  VoiceSessionStatus,
  VoiceEvaluationResult,
  ResumeResponse,
} from "@/types/interview.types";

export const aiService = {
  startInterview(data: StartInterviewRequest) {
    return api.post<StartInterviewResponse>(ENDPOINTS.AI.START_INTERVIEW, data);
  },

  // In ai.service.ts
  answerQuestion(data: AnswerQuestionRequest) {
    return api.post<AnswerQuestionResponse>(
      ENDPOINTS.AI.ANSWER_QUESTION,
      null,
      {
        params: {
          interviewScheduleId: data.interviewScheduleId,
          answer: data.answer, // Changed from conversationHistory
          finalAnswer: data.finalAnswer,
          jobPrefix: data.jobPrefix,
        },
      },
    );
  },

  voiceToText(audioBlob: Blob) {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    return api.post<{ text: string }>(ENDPOINTS.AI.VOICE_TO_TEXT, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadInterviewVideo(scheduleId: number, videoBlob: Blob) {
    const formData = new FormData();
    formData.append("file", videoBlob, `interview-${scheduleId}.webm`);
    return api.post<string>(ENDPOINTS.AI.UPLOAD_VIDEO(scheduleId), formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000, // 5 min for large uploads
    });
  },

  uploadScreenRecording(scheduleId: number, screenBlob: Blob) {
    const formData = new FormData();
    formData.append("file", screenBlob, `screen-${scheduleId}.webm`);
    return api.post<string>(
      ENDPOINTS.AI.UPLOAD_SCREEN_RECORDING(scheduleId),
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000, // 5 min for large uploads
      },
    );
  },

  // Voice interview endpoints
  startVoiceInterview(data: StartInterviewRequest) {
    return api.post<VoiceStartResponse>(ENDPOINTS.AI.VOICE_START, data);
  },

  endVoiceInterview(scheduleId: number) {
    return api.post<void>(ENDPOINTS.AI.VOICE_END(scheduleId));
  },

  getVoiceStatus(scheduleId: number) {
    return api.get<VoiceSessionStatus>(ENDPOINTS.AI.VOICE_STATUS(scheduleId));
  },

  getVoiceEvaluation(scheduleId: number) {
    return api.get<VoiceEvaluationResult>(
      ENDPOINTS.AI.VOICE_EVALUATION(scheduleId),
      {
        timeout: 120000, // Evaluation can take longer
      },
    );
  },

  // Item 4: Resume endpoint
  resumeVoiceInterview(scheduleId: number) {
    return api.get<ResumeResponse>(ENDPOINTS.AI.VOICE_RESUME(scheduleId));
  },

  compileCode(data: { code: string; language: string; stdin?: string }) {
    return api.post<{ output: string; error: string; executionTimeMs: number }>(
      ENDPOINTS.COMPILE,
      data,
    );
  },
};
