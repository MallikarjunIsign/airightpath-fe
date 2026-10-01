import { useState, useRef, useCallback } from 'react';

interface UseScreenRecorderOptions {
  timeslice?: number;
  onScreenStop?: () => void;
  /**
   * The interviewer's voice, to be mixed in alongside the microphone.
   *
   * <p>A function rather than a value: the audio graph it comes from is built
   * lazily when the first question is spoken, which is after the recording
   * starts. Read at start time it would always be null.</p>
   */
  getInterviewerAudio?: () => MediaStream | null;
}

/**
 * Both voices summed into one audio track.
 *
 * <p>Falls back to the microphone alone when there is no interviewer audio —
 * before the first question is spoken, or when TTS went through the browser's
 * own speech synthesis, which a page cannot capture. Half a conversation is
 * still better than failing the recording.</p>
 */
function mixAudio(
  micStream: MediaStream,
  interviewerStream: MediaStream | null,
  contextRef: React.MutableRefObject<AudioContext | null>
): MediaStreamTrack[] {
  if (!interviewerStream?.getAudioTracks().length) {
    return micStream.getAudioTracks();
  }

  try {
    // `interactive` asks the browser for the smallest buffer it can manage.
    // The default hint optimises for power, which buys a larger buffer and
    // puts the mixed audio tens of milliseconds behind the video track it is
    // recorded alongside — heard back as lips out of step with the voice.
    const context = new AudioContext({ latencyHint: 'interactive' });
    contextRef.current = context;
    const destination = context.createMediaStreamDestination();

    context.createMediaStreamSource(micStream).connect(destination);
    context.createMediaStreamSource(interviewerStream).connect(destination);

    return destination.stream.getAudioTracks();
  } catch (err) {
    // A recording with the candidate's voice is worth far more than no
    // recording at all, so a failure to mix falls back rather than throws.
    console.warn('Could not mix the interviewer audio into the recording', err);
    return micStream.getAudioTracks();
  }
}

export function useScreenRecorder(options?: UseScreenRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  /**
   * The shared screen, for showing the candidate what is being captured.
   *
   * Video only — deliberately not the combined stream `start` returns, which
   * carries the microphone track too and would feed the candidate's own voice
   * back at them through any element it is attached to.
   */
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  /**
   * Whether sharing ended on its own, rather than because the interview did.
   *
   * Drives the candidate-facing prompt to share again. Held as state because
   * the panel has to re-render into its alert when it flips.
   */
  const [stoppedEarly, setStoppedEarly] = useState(false);

  /**
   * One finished Blob per share.
   *
   * <p>Sharing can stop and be picked up again mid-interview — the candidate
   * closes the shared window, or hits the browser's own "Stop sharing" bar —
   * and the footage from before that must survive. It is kept as separate
   * files rather than one because each MediaRecorder run emits a complete
   * WebM with its own header: appended end to end, every player stops at the
   * boundary and the later parts are silently lost. Separate files are
   * uploaded as separate parts and the reviewer plays them in order.</p>
   */
  const segmentsRef = useRef<Blob[]>([]);
  /** Chunks of the share currently being recorded. */
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeTypeRef = useRef<string>('video/webm');
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  /** The graph that mixes the two voices; closed with the recording. */
  const mixContextRef = useRef<AudioContext | null>(null);

  // Keep callback ref fresh so stale closures don't matter
  const onScreenStopRef = useRef(options?.onScreenStop);
  onScreenStopRef.current = options?.onScreenStop;

  // Same reason as the callback above: read through a ref so `start` does not
  // have to depend on the options object, which is a fresh literal on every
  // render and would rebuild the callback each time.
  const getInterviewerAudioRef = useRef(options?.getInterviewerAudio);
  getInterviewerAudioRef.current = options?.getInterviewerAudio;

  /** Release the capture devices and the mixing graph. */
  const releaseCapture = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    micStreamRef.current = null;
    // Each share builds its own graph. Left open they accumulate for the rest
    // of the interview, and browsers cap how many a page may hold.
    mixContextRef.current?.close().catch(() => {});
    mixContextRef.current = null;
    setScreenStream(null);
  }, []);

  /**
   * Stop the running recorder and bank whatever it captured as one segment.
   *
   * <p>Resolves once the recorder has flushed. A MediaRecorder whose video
   * track has already ended keeps reporting `recording` while producing
   * nothing, so this is also what rescues the footage from a share the
   * candidate cut off.</p>
   */
  const finishSegment = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      const bank = () => {
        if (chunksRef.current.length > 0) {
          segmentsRef.current.push(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
          chunksRef.current = [];
        }
        recorderRef.current = null;
        setIsRecording(false);
        resolve();
      };

      if (!recorder || recorder.state === 'inactive') {
        bank();
        return;
      }
      recorder.onstop = bank;
      recorder.stop();
    });
  }, []);

  /** Prompt for a screen, wire up a recorder, and begin a new segment. */
  const beginCapture = useCallback(async (): Promise<MediaStream> => {
    // 1. Get screen stream (browser will show the "Choose what to share" dialog)
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // A shared screen is mostly still, and the few moments that are not —
        // scrolling, typing — are better served by spending the budget on a
        // clean frame than on twice as many smeared ones.
        frameRate: { ideal: 10 },
      } as MediaTrackConstraints,
      audio: false,
    });
    screenStreamRef.current = screen;
    setScreenStream(screen);

    // 2. Get mic audio separately
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = micStream;

    // 3. Screen video, plus both voices mixed down to a single track.
    //
    // Mixed rather than simply added. A MediaStream can carry two audio
    // tracks, but MediaRecorder records only the first — so attaching the
    // interviewer's voice as a second track would have silently changed
    // nothing, which is the worst kind of fix. Web Audio sums them into one
    // track that the recorder does capture.
    const interviewerAudio = getInterviewerAudioRef.current?.() ?? null;
    const audioTracks = mixAudio(micStream, interviewerAudio, mixContextRef);

    const combinedStream = new MediaStream([
      ...screen.getVideoTracks(),
      ...audioTracks,
    ]);

    chunksRef.current = [];

    const preferred = 'video/webm;codecs=vp8,opus';
    const supported = MediaRecorder.isTypeSupported(preferred);
    mimeTypeRef.current = supported ? preferred : 'video/webm';
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: supported ? preferred : undefined,
      // A ceiling, not a target. VP8 is variable-rate: a still screen spends
      // a fraction of this, and the cap only binds while something is moving.
      // At 800k, 720p text broke up into blocks whenever the candidate
      // scrolled or typed — which is precisely the moment a reviewer needs to
      // read it. Raising the ceiling costs almost nothing on an idle screen
      // and buys legibility on the frames that matter.
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 64_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    // 4. Fire onScreenStop when candidate stops sharing (browser stop button)
    screen.getVideoTracks().forEach((track) => {
      track.onended = () => {
        // A track that has already been replaced by a later share is not the
        // one that just ended for the candidate; ignore its late event.
        if (screenStreamRef.current !== screen) return;
        setStoppedEarly(true);
        // Close out the segment before releasing anything. Everything recorded
        // up to the moment they stopped is kept, so picking the share back up
        // costs only the gap.
        void finishSegment().then(releaseCapture);
        onScreenStopRef.current?.();
      };
    });

    recorderRef.current = recorder;
    recorder.start(options?.timeslice);
    setIsRecording(true);
    setStoppedEarly(false);
    return combinedStream;
  }, [options?.timeslice, finishSegment, releaseCapture]);

  const start = useCallback(async (): Promise<MediaStream> => {
    segmentsRef.current = [];
    return beginCapture();
  }, [beginCapture]);

  /**
   * Pick the share back up after it stopped, without losing what came before.
   *
   * <p>Throws if the candidate dismisses the browser's picker, so the caller
   * can leave the prompt on screen rather than reporting a share that is not
   * happening.</p>
   */
  const resume = useCallback(async (): Promise<MediaStream> => {
    // Defensive: a share that is somehow still live is banked first, so two
    // recorders can never write into the same chunk list.
    await finishSegment();
    releaseCapture();
    return beginCapture();
  }, [beginCapture, finishSegment, releaseCapture]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    releaseCapture();
    setIsRecording(false);
  }, [releaseCapture]);

  /**
   * End the recording and hand back every segment, oldest first.
   *
   * <p>Empty when nothing was ever captured. Each segment is a self-contained
   * WebM; they are uploaded as separate parts rather than joined, because
   * concatenated WebM files play only up to the first boundary.</p>
   */
  const stopAndGetSegments = useCallback(async (): Promise<Blob[]> => {
    await finishSegment();
    releaseCapture();
    setStoppedEarly(false);
    return segmentsRef.current.slice();
  }, [finishSegment, releaseCapture]);

  return { isRecording, stoppedEarly, start, resume, stop, stopAndGetSegments, screenStream };
}
