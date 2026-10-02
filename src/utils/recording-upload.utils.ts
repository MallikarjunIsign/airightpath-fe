import { extractApiError } from '@/services/api.service';

/**
 * Uploading an interview recording so that a bad connection costs a retry
 * rather than the whole recording.
 *
 * <p>A 60-minute screen recording is around 700 MB. One attempt over hotel
 * wifi, at the end of an interview, with no retry, is a coin toss — and losing
 * it loses the only evidence of how a coding answer was arrived at. The
 * candidate is already being told their interview is complete while this runs,
 * so it has to be patient and it has to say what happened.</p>
 */

/** How the upload is going, for the candidate's status row. */
export interface UploadProgress {
  /** 1-based. Above 1 means at least one attempt already failed. */
  attempt: number;
  attempts: number;
  /** 0-100, or null where the browser cannot report it. */
  percent: number | null;
  /** Seconds until the next attempt, while waiting between them. */
  retryInSeconds?: number;
}

export interface UploadOutcome {
  ok: boolean;
  bytes: number;
  attempts: number;
  /** Set when every attempt failed. */
  failureReason?: string;
}

/**
 * Attempts, including the first.
 *
 * <p>Four, with the backoff below, spans a little over half a minute of
 * trying. Enough to ride out a lift, a wifi handover or a brief server
 * restart; not so long that a candidate is held on a "finishing up" screen
 * wondering whether it has hung.</p>
 */
const MAX_ATTEMPTS = 4;

/** Waits before attempts 2, 3 and 4. */
const BACKOFF_MS = [2_000, 6_000, 15_000];

/**
 * Whether another attempt could plausibly succeed.
 *
 * <p>The distinction is the whole value of retrying. A dropped connection or a
 * 503 is worth trying again; a 413 means the file is bigger than the server
 * will ever accept and three more attempts just make the candidate wait longer
 * for the same answer. 401 is its own case — the access token expired during a
 * long upload — and the interceptor refreshes it, so that one is worth a
 * retry.</p>
 */
export function isRetryable(err: unknown): boolean {
  const api = extractApiError(err);
  const status = api.status;

  // No status at all: the request never reached a server. A dropped
  // connection, DNS, a timeout — all transient by nature.
  if (status == null) return true;

  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  if (status === 401) return true;

  // Everything else in the 4xx range is a statement about the request, and
  // the request will be identical next time.
  return false;
}

/** Seconds, rounded up, so a countdown never shows "0s" while still waiting. */
const toSeconds = (ms: number) => Math.ceil(ms / 1000);

/**
 * Upload one recording, retrying while it is worth retrying.
 *
 * <p>Never throws. The caller is in the end-of-interview flow, where an
 * exception would cost the candidate their completion on top of their
 * recording — the outcome comes back as a value and is reported from there.</p>
 *
 * @param send      performs one attempt; receives a progress callback
 * @param bytes     the size being sent, for the audit
 * @param onProgress called as the attempt and its percentage change
 */
export async function uploadWithRetry(
  send: (onUploadProgress: (percent: number | null) => void) => Promise<unknown>,
  bytes: number,
  onProgress?: (progress: UploadProgress) => void,
  /**
   * Checked before each attempt and every second of the waits between them.
   *
   * <p>Four attempts at a twenty-minute timeout is up to eighty minutes of
   * trying, and the candidate is held on the finishing screen for all of it.
   * They have to be able to walk away from their own interview, so the loop
   * has to be interruptible.</p>
   */
  shouldAbandon?: () => boolean,
): Promise<UploadOutcome> {
  let lastReason = 'The upload did not complete.';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (shouldAbandon?.()) {
      return { ok: false, bytes, attempts: attempt - 1, failureReason: 'The candidate left before it finished.' };
    }
    onProgress?.({ attempt, attempts: MAX_ATTEMPTS, percent: 0 });

    try {
      await send((percent) => onProgress?.({ attempt, attempts: MAX_ATTEMPTS, percent }));
      return { ok: true, bytes, attempts: attempt };
    } catch (err) {
      const api = extractApiError(err);
      lastReason = api.serverMessage || api.message || lastReason;

      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        return { ok: false, bytes, attempts: attempt, failureReason: lastReason };
      }

      // Counted down rather than silent. Several seconds of a status row
      // saying nothing is indistinguishable from a page that has hung, and
      // this one sits in front of a candidate waiting to leave.
      const waitMs = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      for (let remaining = waitMs; remaining > 0; remaining -= 1000) {
        if (shouldAbandon?.()) {
          return { ok: false, bytes, attempts: attempt, failureReason: 'The candidate left before it finished.' };
        }
        onProgress?.({
          attempt,
          attempts: MAX_ATTEMPTS,
          percent: null,
          retryInSeconds: toSeconds(remaining),
        });
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remaining)));
      }
    }
  }

  return { ok: false, bytes, attempts: MAX_ATTEMPTS, failureReason: lastReason };
}

/**
 * Hand the candidate the recording that could not be uploaded.
 *
 * <p>The last resort, and the reason it exists: without it a recording that
 * failed every attempt is simply gone the moment the tab closes, and with it
 * the only record of a disputed interview. Saving it to their machine means
 * somebody can still ask for it.</p>
 */
export function downloadRecording(blobs: Blob[], scheduleId: number, kind: string): void {
  blobs.forEach((blob, index) => {
    const suffix = blobs.length > 1 ? `-part${index + 1}` : '';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `interview-${scheduleId}-${kind}${suffix}.webm`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on a delay: revoking immediately cancels the download in
    // Chromium, which is how this silently produced nothing the first time.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}
