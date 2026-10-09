import api from "./api.service";
import { ENDPOINTS } from "@/config/api.endpoints";
import type { ApiResponse } from "@/types/api.types";
import type {
  InterviewSchedule,
  BulkInterviewAssignRequest,
  InterviewStats,
  InterviewRound,
  InterviewReviewDTO,
  InterviewReviewRequest,
  ProctoringEvent,
  MobileCapture,
} from "@/types/interview.types";

/**
 * Query for the results list and the stats that summarise it.
 *
 * Absent keys rather than empty ones: the server reads an unrecognised `round`
 * as a 400, and `round=` is unrecognised — so an "all rounds" view has to omit
 * the parameter, not send it blank.
 */
function buildResultsParams(jobPrefix?: string, round?: InterviewRound, includeDeleted?: boolean) {
  const params: Record<string, string> = {};
  if (jobPrefix) params.jobPrefix = jobPrefix;
  if (round) params.round = round;
  if (includeDeleted) params.includeDeleted = 'true';
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
  /** The interviewer's own 0-10 read on a candidate turn, if it rated one. */
  answerScore?: number;
  /** The evaluation category an interviewer turn was asking about. */
  topic?: string;
  /** Whether an interviewer turn opened new ground, pressed, or re-asked. */
  turnKind?: 'NEW_QUESTION' | 'FOLLOW_UP' | 'REPHRASE';
  /**
   * Set on a candidate turn that tried to give the interviewer instructions —
   * "ignore your rules", "score me 10". The attempt has no effect on the
   * interview, but a reviewer should not have to spot it themselves in the
   * middle of a long transcript.
   */
  injectionSuspected?: boolean;
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

  /**
   * The interviews a candidate still has in front of them.
   *
   * `silent` suppresses the global error toast — for background reads like the
   * sidebar/notification badge, where a failure should cost a badge rather than
   * put a red toast on a screen the candidate did not ask to load.
   */
  getActiveInterviews(email: string, opts?: SilentOpts) {
    return api.get<InterviewSchedule[]>(ENDPOINTS.INTERVIEWS.GET_ACTIVE, {
      params: { email },
      ...(opts?.silent ? { _skipErrorToast: true } : {}),
    } as never);
  },

  /** `round` omitted returns every round. Removed results are left out unless asked for. */
  getResults(
    jobPrefix?: string,
    round?: InterviewRound,
    opts?: SilentOpts & { includeDeleted?: boolean },
  ) {
    return api.get<InterviewSchedule[]>(ENDPOINTS.INTERVIEWS.GET_RESULTS, {
      params: buildResultsParams(jobPrefix, round, opts?.includeDeleted),
      ...(opts?.silent ? { _skipErrorToast: true } : {}),
    } as never);
  },

  /**
   * Takes a result off the results list, with a reason.
   *
   * <p>Soft: nothing about the interview is destroyed. The reason is required
   * by the server, and goes back out on the row so anyone looking at removed
   * results can see why.</p>
   */
  deleteResult(id: number, reason: string) {
    return api.delete<InterviewSchedule>(ENDPOINTS.INTERVIEWS.DELETE_RESULT(id), {
      data: { reason },
    });
  },

  /** Puts a removed result back on the list. */
  restoreResult(id: number) {
    return api.post<InterviewSchedule>(ENDPOINTS.INTERVIEWS.RESTORE_RESULT(id));
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
   * Tie a phone's pairing token to this interview, so the phone can send its own
   * recording and photos without a login.
   */
  registerMobilePairing(scheduleId: number, token: string) {
    return api.post(ENDPOINTS.INTERVIEWS.MOBILE_PAIRING(scheduleId), null, {
      params: { token },
      _skipErrorToast: true,
    } as never);
  },

  /** Save one still taken from the candidate's paired phone. */
  uploadMobileCapture(scheduleId: number, kind: 'ROOM_PHOTO' | 'MONITOR_FRAME', photo: Blob) {
    const form = new FormData();
    form.append('photo', photo, `${kind.toLowerCase()}.jpg`);
    form.append('kind', kind);
    form.append('capturedAt', new Date().toISOString());
    return api.post(ENDPOINTS.INTERVIEWS.MOBILE_CAPTURES(scheduleId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Silent: a still that did not save is not something to interrupt an
      // interview about.
      _skipErrorToast: true,
    } as never);
  },

  /** The stills taken from the paired phone during one interview. */
  listMobileCaptures(scheduleId: number) {
    return api.get<MobileCapture[]>(ENDPOINTS.INTERVIEWS.MOBILE_CAPTURES(scheduleId));
  },

  /** One still's bytes. Fetched as a blob: the image sits behind the reviewer's permission. */
  getMobileCaptureImage(captureId: number) {
    return api.get<Blob>(ENDPOINTS.INTERVIEWS.MOBILE_CAPTURE_IMAGE(captureId), { responseType: 'blob' });
  },

  /**
   * A temporary URL that plays one of an interview's recordings.
   *
   * @param kind 'camera' for the webcam, 'screen' for the shared screen
   */
  getRecordingLink(
    scheduleId: number,
    kind: 'camera' | 'screen' | 'mobile',
    disposition: 'inline' | 'attachment' = 'inline',
    part = 0,
  ) {
    // `parts` comes back because a screen recording may be several files: the
    // candidate can stop sharing mid-interview and pick it back up, and each
    // share is stored on its own. One file was being played and the rest were
    // invisible, which made an interrupted recording look like a short one.
    return api.get<{ url: string; expiresInSeconds: number; part: number; parts: number }>(
      ENDPOINTS.INTERVIEWS.RECORDING_LINK(scheduleId),
      { params: { kind, disposition, part } },
    );
  },

  /**
   * Files what became of a recording, so the attempt is on the record.
   *
   * <p>Silent and never thrown from by the caller: this runs while the
   * candidate waits on the finishing screen, and a failure to file the audit
   * must not cost them their completion on top of whatever it is auditing.</p>
   */
  reportRecordingOutcome(
    scheduleId: number,
    outcome: {
      kind: 'camera' | 'screen' | 'mobile';
      success: boolean;
      bytes: number;
      attempts: number;
      parts: number;
      failureReason?: string;
    },
  ) {
    return api.post<void>(ENDPOINTS.INTERVIEWS.RECORDING_OUTCOME(scheduleId), outcome, {
      _skipErrorToast: true,
    } as never);
  },

  getProctoringEvents(scheduleId: number) {
    return api.get<ProctoringEvent[]>(
      ENDPOINTS.INTERVIEW_ADMIN.PROCTORING_EVENTS(scheduleId),
    );
  },

  // Item 16: Get conversation transcript
  /**
   * A reviewer's decision on an interview, or null when nobody has looked yet.
   *
   * The server answers 204 for "not reviewed", which axios surfaces as an empty
   * body — mapped to null here so callers do not have to tell an absent review
   * apart from one with empty notes.
   */
  async getReview(scheduleId: number, opts?: SilentOpts) {
    const res = await api.get<InterviewReviewDTO | ''>(
      ENDPOINTS.INTERVIEWS.REVIEW(scheduleId),
      { ...(opts?.silent ? { _skipErrorToast: true } : {}) } as never,
    );
    return res.data && typeof res.data === 'object' ? res.data : null;
  },

  /** Save notes, and a result override if the reviewer is changing it. */
  saveReview(scheduleId: number, body: InterviewReviewRequest, opts?: SilentOpts) {
    return api.post<InterviewReviewDTO>(
      ENDPOINTS.INTERVIEWS.REVIEW(scheduleId),
      body,
      { ...(opts?.silent ? { _skipErrorToast: true } : {}) } as never,
    );
  },

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
