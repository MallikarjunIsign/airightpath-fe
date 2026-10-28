import { useEffect, useRef } from 'react';

export type PhoneAlertReason = 'EXTRA_PERSON' | 'NO_CANDIDATE';

interface Options {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Watching only while the room is verified and the interview is running. */
  enabled: boolean;
  /** Handed a photo and why it was taken. */
  onAlert: (reason: PhoneAlertReason, photo: Blob) => void;
}

/** How often the phone's picture is looked at. */
const CHECK_MS = 4000;
/** Consecutive looks that must agree, so a passing shadow or a turned head does not count. */
const EXTRA_PERSON_LOOKS = 2;
const NO_CANDIDATE_LOOKS = 4;
/** After a photo for one reason, the next for the same reason waits this long. */
const COOLDOWN_MS = 60_000;

/**
 * Watches the phone's picture for the two things worth a photo: a second person, or nobody.
 *
 * <p>The phone looks at the candidate and the computer together, so it sees what the computer's own camera cannot,
 * such as a person standing beside the screen or the candidate stepping away. It does not keep a photo every few
 * seconds; it keeps one when one of those happens, and says which. The check runs here on the phone with a small
 * face detector, so nothing is sent to a server to be judged.</p>
 */
export function usePhoneProctor({ videoRef, enabled, onAlert }: Options) {
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | null = null;
    let extraLooks = 0;
    let emptyLooks = 0;
    const lastSent: Record<PhoneAlertReason, number> = { EXTRA_PERSON: 0, NO_CANDIDATE: 0 };
    let faceApi: typeof import('face-api.js') | null = null;

    const photo = (video: HTMLVideoElement): Promise<Blob | null> =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      });

    const raise = async (reason: PhoneAlertReason, video: HTMLVideoElement) => {
      const now = Date.now();
      if (now - lastSent[reason] < COOLDOWN_MS) return;
      lastSent[reason] = now;
      const blob = await photo(video);
      if (blob && !cancelled) onAlertRef.current(reason, blob);
    };

    const look = async () => {
      const video = videoRef.current;
      if (cancelled || !video || !faceApi || video.readyState < 2 || video.videoWidth === 0 || document.hidden) {
        schedule();
        return;
      }
      try {
        const faces = await faceApi.detectAllFaces(
          video,
          new faceApi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }),
        );
        extraLooks = faces.length >= 2 ? extraLooks + 1 : 0;
        emptyLooks = faces.length === 0 ? emptyLooks + 1 : 0;
        if (extraLooks >= EXTRA_PERSON_LOOKS) {
          extraLooks = 0;
          await raise('EXTRA_PERSON', video);
        } else if (emptyLooks >= NO_CANDIDATE_LOOKS) {
          emptyLooks = 0;
          await raise('NO_CANDIDATE', video);
        }
      } catch (err) {
        console.warn('Phone face check failed', err);
      }
      schedule();
    };

    const schedule = () => {
      if (!cancelled) timer = window.setTimeout(look, CHECK_MS);
    };

    (async () => {
      try {
        const loaded = await import('face-api.js');
        await loaded.nets.tinyFaceDetector.loadFromUri('/models');
        if (cancelled) return;
        faceApi = loaded;
        schedule();
      } catch (err) {
        // No detector, no photos: the phone still records, which is the continuous evidence.
        console.warn('The phone could not load its face detector', err);
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, videoRef]);
}
