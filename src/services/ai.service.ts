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

/**
 * How long one upload attempt may take.
 *
 * Five minutes was enough for the recordings this started with and is not
 * enough for an hour of shared screen: ~700 MB on a 10 Mbit uplink is around
 * ten minutes of sending, and the attempt was being aborted mid-flight and
 * reported as a failure. Twenty minutes covers that with room to spare, and
 * retries sit on top of it.
 */
const UPLOAD_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Adapts axios' progress event to a plain percentage.
 *
 * `total` is absent when the body is streamed or the length is unknown, so
 * the percentage is nullable rather than quietly reported as zero — a bar
 * frozen at 0% reads as a stalled upload.
 */
function progressReporter(onProgress?: (percent: number | null) => void) {
  if (!onProgress) return undefined;
  return (event: { loaded: number; total?: number }) => {
    onProgress(
      event.total ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null,
    );
  };
}

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

  uploadInterviewVideo(
    scheduleId: number,
    videoBlob: Blob,
    onProgress?: (percent: number | null) => void,
  ) {
    const formData = new FormData();
    formData.append("file", videoBlob, `interview-${scheduleId}.webm`);
    return api.post<string>(ENDPOINTS.AI.UPLOAD_VIDEO(scheduleId), formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: progressReporter(onProgress),
      // No global error toast. This runs after the interview has finished, and
      // a failed upload is the platform's problem, not the candidate's — they
      // were told their interview was complete and then shown "Unable to
      // connect. Please check your internet connection", which reads as though
      // their answers had been lost. The failure is recorded against the
      // interview instead, where a reviewer will see it.
      _skipErrorToast: true,
    } as never);
  },

  uploadScreenRecording(
    scheduleId: number,
    screenBlob: Blob,
    onProgress?: (percent: number | null) => void,
  ) {
    const formData = new FormData();
    formData.append("file", screenBlob, `screen-${scheduleId}.webm`);
    return api.post<string>(
      ENDPOINTS.AI.UPLOAD_SCREEN_RECORDING(scheduleId),
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: progressReporter(onProgress),
        // Silent for the same reason as the camera upload above.
        _skipErrorToast: true,
      } as never,
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
