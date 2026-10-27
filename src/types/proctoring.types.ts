/** Kinds of pre-exam artefact the backend stores. Mirrors ProctoringCaptureType. */
export type ProctoringCaptureType = 'IDENTITY_PHOTO' | 'ROOM_SCAN_FRAME';

/**
 * A stored pre-exam capture, as the admin console receives it.
 *
 * The bytes are not inlined — `imageUrl` points at the endpoint that streams
 * them, so listing a full room scan stays small. That endpoint requires
 * ASSESSMENT_READ, so the image is fetched with the auth header rather than put
 * straight into an <img src>.
 */
export interface ProctoringCapture {
  id: number;
  assessmentId: number;
  candidateEmail: string;
  jobPrefix: string;
  captureType: ProctoringCaptureType;
  /** Position within a room sweep; 0 for an identity photo. */
  frameIndex: number;
  contentType: string;
  sizeBytes?: number;
  capturedAt?: string;
  uploadedAt?: string;
  imageUrl: string;
}
