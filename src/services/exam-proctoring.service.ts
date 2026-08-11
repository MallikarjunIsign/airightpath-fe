import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import { snapshotFileName } from '@/utils/media.utils';
import type { ApiResponse } from '@/types/api.types';
import type { ProctoringCapture } from '@/types/proctoring.types';

/**
 * Uploads for the pre-exam checks: the identity photo every candidate must take,
 * and the optional room scan.
 *
 * Both calls pass `_skipErrorToast` — the system-check card renders its own
 * inline state for a failed upload, and a red toast on top of that would read as
 * if the candidate had done something wrong.
 */

interface IdentityPhotoUpload {
  assessmentId: number;
  candidateEmail: string;
  blob: Blob;
}

interface RoomScanUpload {
  assessmentId: number;
  candidateEmail: string;
  frames: Blob[];
}

/**
 * No Content-Type here on purpose. multipart bodies need a boundary, and only
 * the browser can generate one — naming the type by hand produces a header with
 * no boundary that the server cannot parse. Leaving it unset lets the browser
 * write the full header itself.
 */
const uploadConfig = {
  _skipErrorToast: true,
} as never;

/** Reads report their own failures in place; no toast on top. */
const silentRead = { _skipErrorToast: true };

export const examProctoringService = {
  uploadIdentityPhoto({ assessmentId, candidateEmail, blob }: IdentityPhotoUpload) {
    const form = new FormData();
    form.append('assessmentId', String(assessmentId));
    form.append('candidateEmail', candidateEmail);
    form.append('capturedAt', new Date().toISOString());
    form.append('photo', blob, snapshotFileName('identity'));

    return api.post<ApiResponse<unknown>>(ENDPOINTS.EXAM_PROCTORING.IDENTITY_PHOTO, form, uploadConfig);
  },

  /**
   * Everything captured for one assessment attempt, for review beside its result.
   *
   * Silent, like the uploads: the review card states the reason inline and
   * offers a retry, so a toast would only repeat it in a place the reviewer has
   * to dismiss.
   */
  getCapturesForAssessment(assessmentId: number) {
    return api.get<ApiResponse<ProctoringCapture[]>>(
      ENDPOINTS.EXAM_PROCTORING.ASSESSMENT_CAPTURES(assessmentId),
      silentRead
    );
  },

  /** Every capture across a candidate's attempts for one job. */
  getCapturesForCandidate(candidateEmail: string, jobPrefix: string) {
    return api.get<ApiResponse<ProctoringCapture[]>>(
      ENDPOINTS.EXAM_PROCTORING.CANDIDATE_CAPTURES,
      { params: { candidateEmail, jobPrefix }, ...silentRead }
    );
  },

  /**
   * The image bytes for one capture.
   *
   * Fetched rather than pointed at from an <img src> because the endpoint is
   * behind ASSESSMENT_READ and the access token lives in memory, not in a
   * cookie — a bare <img> request would arrive unauthenticated.
   */
  getCaptureImage(captureId: number) {
    return api.get<Blob>(ENDPOINTS.EXAM_PROCTORING.CAPTURE_IMAGE(captureId), {
      responseType: 'blob',
      ...silentRead,
    });
  },

  uploadRoomScan({ assessmentId, candidateEmail, frames }: RoomScanUpload) {
    const form = new FormData();
    form.append('assessmentId', String(assessmentId));
    form.append('candidateEmail', candidateEmail);
    form.append('capturedAt', new Date().toISOString());
    frames.forEach((frame, i) => form.append('frames', frame, snapshotFileName('room', i)));

    return api.post<ApiResponse<unknown>>(ENDPOINTS.EXAM_PROCTORING.ROOM_SCAN, form, uploadConfig);
  },
};
