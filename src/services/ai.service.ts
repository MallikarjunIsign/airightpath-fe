import api, { extractApiError } from "./api.service";
import { isRetryable } from "@/utils/recording-upload.utils";
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

/**
 * The size of each piece a recording is sent in.
 *
 * Five megabytes is S3's minimum for every piece but the last, and it is small
 * enough to get through whatever sits in front of the server. A whole
 * recording in one request did not: a proxy refuses an oversize body by
 * closing the connection, the browser reports a dropped connection, and
 * recordings of a few megabytes saved while a full interview's never did.
 */
const PIECE_BYTES = 5 * 1024 * 1024;

/** Waits before pieces' second to fifth attempts. */
const PIECE_BACKOFF_MS = [1_000, 3_000, 8_000, 15_000];

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

  /**
   * Send a recording in pieces, and join them on the server.
   *
   * <p>Each piece is retried on its own, so a bad connection costs one piece
   * rather than the recording. Where the server does not have the endpoints
   * yet (an older backend), it falls back to the single request this replaced
   * — so the two halves can be deployed in either order.</p>
   */
  async uploadRecording(
    scheduleId: number,
    kind: "camera" | "screen",
    blob: Blob,
    onProgress?: (percent: number | null) => void,
  ): Promise<unknown> {
    const base = `/api/interview/${scheduleId}/recording-upload`;

    let session: { uploadId: string; blobName: string };
    try {
      const res = await api.post<{ uploadId: string; blobName: string }>(base, null, {
        params: { kind },
        _skipErrorToast: true,
      } as never);
      session = res.data;
    } catch (err) {
      const status = extractApiError(err).status;
      if (status === 404 || status === 405) {
        return kind === "camera"
          ? this.uploadInterviewVideo(scheduleId, blob, onProgress)
          : this.uploadScreenRecording(scheduleId, blob, onProgress);
      }
      throw err;
    }

    const pieces = Math.max(1, Math.ceil(blob.size / PIECE_BYTES));
    for (let part = 1; part <= pieces; part++) {
      const piece = blob.slice((part - 1) * PIECE_BYTES, part * PIECE_BYTES);
      for (let attempt = 1; ; attempt++) {
        try {
          await api.post(`${base}/part`, piece, {
            headers: { "Content-Type": "application/octet-stream" },
            params: { uploadId: session.uploadId, blobName: session.blobName, part },
            timeout: 5 * 60 * 1000,
            _skipErrorToast: true,
          } as never);
          break;
        } catch (err) {
          if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
          await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
        }
      }
      onProgress?.(Math.round((part / pieces) * 100));
    }

    return api.post<string>(`${base}/complete`, null, {
      params: { kind, uploadId: session.uploadId, blobName: session.blobName },
      timeout: 5 * 60 * 1000,
      _skipErrorToast: true,
    } as never);
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
