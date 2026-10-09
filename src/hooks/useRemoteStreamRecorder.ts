import { useCallback, useEffect, useRef } from 'react';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { recordingSync } from '@/services/recording-sync.service';

interface UseRemoteStreamRecorderOptions {
  /** The phone's picture, as it arrives over the pairing connection. Null until paired. */
  stream: MediaStream | null;
  /** False records nothing, as for a deployment that does not want the phone kept. */
  enabled: boolean;
  /** Read lazily: the interview has not been created when this hook is. Laptop only. */
  scheduleId?: () => number | null | undefined;
  /**
   * The pairing token, on the phone. Set instead of `scheduleId`: the phone
   * has no login, and its recording is filed against the interview its token
   * was registered for.
   */
  token?: string | null;
  /** Called once the recorder is actually running. */
  onStarted?: () => void;
  /** Close the recording off every `segmentMs` and upload that part, as the camera does. */
  segmentMs?: number;
  timeslice?: number;
  /** Told when the phone's video stops delivering, so it can be put on the interview's record. */
  onProblem?: (message: string) => void;
}

/**
 * Record the candidate's paired phone, and keep it as the third recording of
 * the interview beside the laptop camera and the shared screen.
 *
 * <p>Recorded here, on the desktop, from the stream the phone already sends,
 * rather than on the phone. The phone holds only a pairing token that nothing
 * on the server ties to an interview, so it has no way to upload a recording
 * against the right candidate; this page is signed in and knows exactly which
 * interview is being sat. The cost is that the recording is what survived the
 * pairing connection, which is a phone-call-quality picture — ample for seeing
 * the room, which is what it is for.</p>
 *
 * <p>Follows the camera's rules: every chunk is kept in the browser's own store
 * as it arrives, finished parts upload in the background, and a closed tab
 * costs seconds rather than the recording. A new stream — the phone dropping
 * and reconnecting hands over a fresh one — closes the current part and starts
 * another, because a WebM cannot carry on across a different source.</p>
 */
export function useRemoteStreamRecorder(options: UseRemoteStreamRecorderOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentTimerRef = useRef<number | null>(null);
  /** Whether any recorder has ever been started, so "nothing captured" is only said when it matters. */
  const everStartedRef = useRef(false);
  const mimeRef = useRef('video/webm');

  /** Close the current part, hand it to the uploader, and release the recorder. */
  const closeCurrent = useCallback((): Promise<void> => {
    if (segmentTimerRef.current != null) {
      window.clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      const finalise = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (chunks.length > 0 && sessionRef.current) {
          recordingSync.submit(sessionRef.current, new Blob(chunks, { type: mimeRef.current }));
        } else {
          recordingSync.discard(sessionRef.current);
        }
        sessionRef.current = null;
        recorderRef.current = null;
        resolve();
      };
      if (!recorder || recorder.state === 'inactive') {
        finalise();
        return;
      }
      recorder.onstop = finalise;
      try {
        recorder.stop();
      } catch {
        finalise();
      }
    });
  }, []);

  const open = useCallback((stream: MediaStream) => {
    const opts = optionsRef.current;
    // The first the browser can do. A phone often cannot record WebM: an
    // iPhone records MP4, and offering it only WebM would fail to record at all.
    const mimeType = [
      PROCTORING_CONFIG.recording.camera.mimeType,
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: PROCTORING_CONFIG.recording.mobile.videoBitsPerSecond,
        audioBitsPerSecond: PROCTORING_CONFIG.recording.camera.audioBitsPerSecond,
      });
    } catch (err) {
      opts.onProblem?.(`The phone's stream could not be recorded (${err instanceof Error ? err.message : String(err)}).`);
      return;
    }
    mimeRef.current = recorder.mimeType || mimeType || 'video/webm';

    chunksRef.current = [];
    const sessionId = opts.token
      ? recordingSync.beginForToken(opts.token, 'mobile', mimeRef.current)
      : recordingSync.begin(opts.scheduleId?.(), 'mobile', mimeRef.current);
    sessionRef.current = sessionId;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        recordingSync.chunk(sessionId, event.data);
      }
    };
    recorder.onerror = () => opts.onProblem?.('The phone recorder reported an error.');

    recorderRef.current = recorder;
    recorder.start(opts.timeslice ?? 15_000);
    const firstStart = !everStartedRef.current;
    everStartedRef.current = true;
    if (!sessionId && !opts.token && !opts.scheduleId?.()) {
      // Running, but with nowhere to store it: say so rather than record into nothing.
      opts.onProblem?.('The phone recording has no interview to be filed against.');
    }
    // Once per recording, not once per part: it is the audit line that says it began.
    if (firstStart) opts.onStarted?.();

    if (opts.segmentMs) {
      segmentTimerRef.current = window.setInterval(() => {
        void closeCurrent().then(() => {
          // Only while the same phone is still the source.
          const current = optionsRef.current;
          if (current.enabled && current.stream === stream && stream.active) open(stream);
        });
      }, opts.segmentMs);
    }
  }, [closeCurrent]);

  // One recorder per stream. Leaving — a new stream, recording switched off, or
  // the page unmounting — closes the part in progress and uploads it.
  useEffect(() => {
    const { stream, enabled } = options;
    if (!enabled || !stream || stream.getVideoTracks().length === 0) return;

    // A stream that arrives over a peer connection only delivers frames while
    // something is rendering it. Recorded with nothing playing it, a MediaRecorder
    // produces empty chunks — measured: 0 bytes over three seconds, against
    // tens of kilobytes a second once a video element was playing the same
    // stream. The interview screen normally shows the phone, but a recording
    // must not depend on which screen is up or whether that element has
    // mounted yet, so the recorder carries its own: never on the page, muted,
    // and released with the recording.
    const consumer = document.createElement('video');
    consumer.muted = true;
    consumer.playsInline = true;
    consumer.srcObject = stream;
    consumer.play().catch(() => {
      // Autoplay refusals do not apply to a muted element; if one happens
      // anyway the on-screen element is still the fallback.
    });

    open(stream);
    return () => {
      void closeCurrent().finally(() => {
        consumer.pause();
        consumer.srcObject = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.stream, options.enabled]);

  /**
   * The interview is over: close the last part, and say how the recording went.
   *
   * @param report whether to report an outcome at all. False where the phone
   *               was never meant to be recording (never paired), so "nothing
   *               was captured" is not filed against an interview that had no
   *               phone.
   */
  const stopAndFinish = useCallback(
    async (report: boolean) => {
      await closeCurrent();
      if (!report) return;
      const { token, scheduleId } = optionsRef.current;
      if (token) recordingSync.finishForToken(token, 'mobile');
      else recordingSync.finish(scheduleId?.(), 'mobile');
    },
    [closeCurrent],
  );

  return { stopAndFinish, hasStarted: () => everStartedRef.current };
}
