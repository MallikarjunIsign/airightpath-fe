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
  /**
   * Send a stretch of the candidate's answer to be transcribed. The text comes back on the interview's
   * transcription topic, so this only reports whether the audio was accepted.
   */
  sendAudioChunk(scheduleId: number, audio: Blob, chunkIndex: number) {
    const form = new FormData();
    form.append("audio", audio, `answer_${chunkIndex}.webm`);
    form.append("chunkIndex", String(chunkIndex));
    return api.post(`/api/interview/voice/${scheduleId}/audio-chunk`, form, {
      timeout: 2 * 60 * 1000,
      _skipErrorToast: true,
    } as never);
  },

  async uploadRecording(
    scheduleId: number,
    kind: "camera" | "screen" | "mobile",
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
      if ((status === 404 || status === 405) && kind !== "mobile") {
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

/** A multipart upload that has been started, as the server names it. */
export interface RecordingUploadSession {
  uploadId: string;
  blobName: string;
}

/**
 * A recording sent to storage while it is still being made.
 *
 * <p>The three steps of {@link aiService.uploadRecording}, separated, because a
 * recording is now one continuous file that grows for the whole interview: it
 * is begun once, a piece is sent each time enough has been recorded, and it is
 * joined when the interview ends. Cutting it into separate files every ten
 * minutes — which is what this replaced — gave the reviewer parts with a gap
 * between them instead of an interview.</p>
 */
export const recordingUploadApi = {
  async begin(
    scheduleId: number,
    kind: "camera" | "screen" | "mobile",
    contentType: string,
  ): Promise<RecordingUploadSession> {
    const res = await api.post<RecordingUploadSession>(`/api/interview/${scheduleId}/recording-upload`, null, {
      params: { kind, type: contentType },
      _skipErrorToast: true,
    } as never);
    return res.data;
  },

  /** Send one piece, retrying it on its own. A 410 means the server already finished this upload. */
  async part(
    scheduleId: number,
    session: RecordingUploadSession,
    part: number,
    piece: Blob,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await api.post(`/api/interview/${scheduleId}/recording-upload/part`, piece, {
          headers: { "Content-Type": "application/octet-stream" },
          params: { uploadId: session.uploadId, blobName: session.blobName, part },
          timeout: 5 * 60 * 1000,
          _skipErrorToast: true,
        } as never);
        return;
      } catch (err) {
        if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
        await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
      }
    }
  },

  /** Join the pieces. Safe to ask twice: the server answers the second time with the first's result. */
  async complete(
    scheduleId: number,
    kind: "camera" | "screen" | "mobile",
    session: RecordingUploadSession,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await api.post(`/api/interview/${scheduleId}/recording-upload/complete`, null, {
          params: { kind, uploadId: session.uploadId, blobName: session.blobName },
          timeout: 5 * 60 * 1000,
          _skipErrorToast: true,
        } as never);
        return;
      } catch (err) {
        if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
        await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
      }
    }
  },
};
