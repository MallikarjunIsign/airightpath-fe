import axios from 'axios';
import { isRetryable } from '@/utils/recording-upload.utils';

/**
 * The paired phone's way of getting its recording to the server.
 *
 * The phone has no login. What authorises it is the pairing token from the QR
 * code, which the candidate's signed-in browser registered against their
 * interview; every call here quotes it. A bare axios instance, not the app's
 * own: that one attaches the candidate's session and redirects to the login
 * page when it is refused, neither of which means anything on a phone that
 * never signed in.
 *
 * Same piecewise upload as the laptop's recordings, for the same reason: a
 * whole recording in one request does not get through a proxy with a body
 * limit, and a phone on mobile data is the connection most likely to drop
 * halfway.
 */

/** The server the phone talks to. Mirrors the phone page's own calls. */
export function mobileApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8082`;
}

const PIECE_BYTES = 5 * 1024 * 1024;
const PIECE_BACKOFF_MS = [1_000, 3_000, 8_000, 15_000];

const http = () => axios.create({ baseURL: mobileApiBase(), timeout: 5 * 60 * 1000 });

export const mobileUploadService = {
  /** Send one finished recording part in pieces and join them on the server. */
  async upload(
    token: string,
    blob: Blob,
    mimeType: string,
    onProgress?: (percent: number | null) => void,
  ): Promise<void> {
    const client = http();
    const begin = await client.post<{ uploadId: string; blobName: string }>('/api/mobile/recording-upload', null, {
      params: { token, type: mimeType },
    });
    const { uploadId, blobName } = begin.data;

    const pieces = Math.max(1, Math.ceil(blob.size / PIECE_BYTES));
    for (let part = 1; part <= pieces; part++) {
      const piece = blob.slice((part - 1) * PIECE_BYTES, part * PIECE_BYTES);
      for (let attempt = 1; ; attempt++) {
        try {
          await client.post('/api/mobile/recording-upload/part', piece, {
            headers: { 'Content-Type': 'application/octet-stream' },
            params: { token, uploadId, blobName, part },
          });
          break;
        } catch (err) {
          if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
          await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
        }
      }
      onProgress?.(Math.round((part / pieces) * 100));
    }

    await client.post('/api/mobile/recording-upload/complete', null, { params: { token, uploadId, blobName } });
  },

  /** How the phone's recording ended up, for the reviewer's audit. */
  async reportOutcome(
    token: string,
    outcome: { kind: 'mobile'; success: boolean; bytes: number; attempts: number; parts: number; failureReason?: string },
  ): Promise<void> {
    await http().post('/api/mobile/recording-outcome', outcome, { params: { token } });
  },

  /** Say that the phone's recording started, could not start, or hit a problem. Never throws. */
  async sendEvent(
    token: string,
    type: 'mobile_recording_started' | 'mobile_recording_not_started' | 'mobile_recording_issue',
    details: string,
  ): Promise<void> {
    try {
      await http().post('/api/mobile/recording-event', null, { params: { token, type, details } });
    } catch {
      // An audit line that did not arrive is not worth interrupting a recording for.
    }
  },
};
