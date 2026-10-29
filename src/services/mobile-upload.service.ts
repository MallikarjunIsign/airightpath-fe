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

const PIECE_BACKOFF_MS = [1_000, 3_000, 8_000, 15_000];

const http = () => axios.create({ baseURL: mobileApiBase(), timeout: 5 * 60 * 1000 });

export const mobileUploadService = {
  /** open, closed (the interview began without a phone), ended (the interview is over) or unknown (not registered yet). */
  async pairingState(token: string): Promise<'open' | 'closed' | 'ended' | 'unknown'> {
    try {
      const res = await http().get<{ state: 'open' | 'closed' | 'ended' | 'unknown' }>('/api/mobile/pairing-status', {
        params: { token },
      });
      return res.data.state;
    } catch {
      return 'unknown';
    }
  },

  /** A photo taken because a second person, or no one, was in the phone's view. Kept for the reviewer. */
  async proctorCapture(token: string, reason: 'EXTRA_PERSON' | 'NO_CANDIDATE', photo: Blob): Promise<void> {
    const form = new FormData();
    form.append('photo', photo, `${reason.toLowerCase()}.jpg`);
    await http().post('/api/mobile/proctor-capture', form, { params: { token, reason }, timeout: 60_000 });
  },

  /** The room scan photos, saved with the interview. The server does not judge them; a reviewer looks. */
  async roomScan(token: string, photos: Blob[]): Promise<void> {
    const form = new FormData();
    photos.forEach((photo, index) => form.append('photos', photo, `room-${index + 1}.jpg`));
    await http().post('/api/mobile/room-scan', form, { params: { token }, timeout: 2 * 60 * 1000 });
  },

  /** Start the phone's recording upload. */
  async begin(token: string, mimeType: string): Promise<{ uploadId: string; blobName: string }> {
    const res = await http().post<{ uploadId: string; blobName: string }>('/api/mobile/recording-upload', null, {
      params: { token, type: mimeType },
    });
    return res.data;
  },

  /** Send one piece, retrying it on its own. A 410 means the server already finished this upload. */
  async part(
    token: string,
    session: { uploadId: string; blobName: string },
    part: number,
    piece: Blob,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await http().post('/api/mobile/recording-upload/part', piece, {
          headers: { 'Content-Type': 'application/octet-stream' },
          params: { token, uploadId: session.uploadId, blobName: session.blobName, part },
        });
        return;
      } catch (err) {
        if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
        await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
      }
    }
  },

  /** Join the pieces. Safe to ask twice. */
  async complete(token: string, session: { uploadId: string; blobName: string }): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await http().post('/api/mobile/recording-upload/complete', null, {
          params: { token, uploadId: session.uploadId, blobName: session.blobName },
        });
        return;
      } catch (err) {
        if (!isRetryable(err) || attempt > PIECE_BACKOFF_MS.length) throw err;
        await new Promise((resolve) => setTimeout(resolve, PIECE_BACKOFF_MS[attempt - 1]));
      }
    }
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
    type:
      | 'mobile_recording_started'
      | 'mobile_recording_not_started'
      | 'mobile_recording_issue'
      | 'mobile_exited'
      | 'mobile_reconnected',
    details: string,
  ): Promise<void> {
    try {
      await http().post('/api/mobile/recording-event', null, { params: { token, type, details } });
    } catch {
      // An audit line that did not arrive is not worth interrupting a recording for.
    }
  },
};
