/** Frame grabbing from a live <video> element, used by the exam identity check. */

interface CaptureOptions {
  /** Longest edge of the produced image. The frame is scaled down to fit. */
  maxWidth?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
}

/**
 * Grabs the current frame of a playing <video> as a JPEG blob.
 *
 * Returns null when the video has no frame yet (metadata not loaded, camera
 * still warming up) rather than producing a black image — callers treat that as
 * "not ready, try again" instead of storing a useless capture.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement | null,
  { maxWidth = 640, quality = 0.85 }: CaptureOptions = {}
): Promise<Blob | null> {
  if (!video || video.readyState < 2) return null;

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, maxWidth / sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/** Names a capture so uploads land in the backend with readable filenames. */
export function snapshotFileName(prefix: string, index?: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return index === undefined ? `${prefix}-${stamp}.jpg` : `${prefix}-${index + 1}-${stamp}.jpg`;
}
