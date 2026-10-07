import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { useState, useRef, useCallback } from 'react';

interface UseMediaRecorderOptions {
  mimeType?: string;
  onDataAvailable?: (blob: Blob) => void;
  timeslice?: number;
  /**
   * False opens the stream but records nothing: no MediaRecorder, no chunks,
   * and `stopAndGetBlob` resolves null.
   *
   * The camera is wanted for two unrelated reasons — the recording kept as
   * evidence, and the live frames face detection reads — and a deployment can
   * want the second without the first. Without this the only way to stop
   * recording was to stop opening the camera, which silently took the face
   * check down with it.
   */
  record?: boolean;
  /**
   * Told when the camera stopped delivering and what was done about it, so the
   * interview can put it on the record instead of ending with a silent,
   * empty recording.
   */
  onProblem?: (message: string) => void;
}

/** Fresh recorders attempted before giving up on a camera that delivers nothing. */
const MAX_RESTARTS = 2;

export function useMediaRecorder(options?: UseMediaRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /** Bumped when the stream is swapped, so a preview bound to `stream` re-renders. */
  const [, setStreamVersion] = useState(0);
  const constraintsRef = useRef<MediaStreamConstraints>({ audio: true, video: true });
  const restartsRef = useRef(0);
  const watchdogRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearWatchdog = () => {
    if (watchdogRef.current != null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /**
   * Record `stream`, and notice if it stops delivering.
   *
   * <p>A camera taken by another application — a call app, a second tab, a
   * driver reset — ends its video track. The recorder does not fail when that
   * happens: it simply never produces a frame, the interview carries on, and at
   * the end there is a zero-byte recording and nothing to say why. Seen
   * directly: the recorder's start event arrived nine seconds late with no
   * data in it.</p>
   *
   * <p>So two things are watched. A video track that ends before anything has
   * been captured, and a recorder that has produced no data well after it
   * should have. Either way the camera is reacquired and recording starts
   * again — only while nothing has been captured, because a recording that
   * already holds footage must not be replaced by a fresh file that loses
   * it.</p>
   */
  const attach = useCallback((stream: MediaStream) => {
    const opts = optionsRef.current;
    const mimeType = opts?.mimeType || PROCTORING_CONFIG.recording.camera.mimeType;
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: PROCTORING_CONFIG.recording.camera.videoBitsPerSecond,
      audioBitsPerSecond: PROCTORING_CONFIG.recording.camera.audioBitsPerSecond,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        setChunks((prev) => [...prev, e.data]);
        optionsRef.current?.onDataAvailable?.(e.data);
      }
    };
    recorder.onstop = () => setIsRecording(false);
    recorder.onerror = () => optionsRef.current?.onProblem?.('The camera recorder reported an error.');

    const restart = async (reason: string) => {
      if (stoppingRef.current || recorderRef.current !== recorder) return;
      if (chunksRef.current.length > 0) {
        // Footage exists; replacing the recorder would discard it. Report only.
        optionsRef.current?.onProblem?.(`${reason} Earlier footage is kept.`);
        return;
      }
      if (restartsRef.current >= MAX_RESTARTS) {
        optionsRef.current?.onProblem?.(`${reason} The camera could not be recovered.`);
        return;
      }
      restartsRef.current += 1;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const fresh = await navigator.mediaDevices.getUserMedia(constraintsRef.current);
        if (stoppingRef.current) {
          fresh.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = fresh;
        optionsRef.current?.onProblem?.(`${reason} The camera was reconnected and recording restarted.`);
        attach(fresh);
        setStreamVersion((v) => v + 1);
      } catch (err) {
        const why = err instanceof DOMException ? `${err.name}: ${err.message}` : String(err);
        optionsRef.current?.onProblem?.(`${reason} The camera could not be reopened (${why}).`);
      }
    };

    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        void restart('The camera stopped delivering video.');
      };
    });

    recorderRef.current = recorder;
    recorder.start(optionsRef.current?.timeslice);
    setIsRecording(true);

    // Generous: the first chunk only arrives after a full timeslice. Without
    // one the whole recording is a single chunk, so there is nothing to wait for.
    const slice = optionsRef.current?.timeslice;
    clearWatchdog();
    if (slice) {
      watchdogRef.current = window.setTimeout(() => {
        if (chunksRef.current.length === 0) void restart('The camera produced no footage.');
      }, slice * 2 + 5000);
    }
  }, []);

  const start = useCallback(async (constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      constraintsRef.current = constraints;
      restartsRef.current = 0;
      stoppingRef.current = false;
      chunksRef.current = [];
      setChunks([]);

      // Stream only: the caller wants live frames, not a recording.
      if (optionsRef.current?.record === false) {
        recorderRef.current = null;
        setIsRecording(false);
        return stream;
      }

      // vp8 and a capped bitrate, matching the screen recorder.
      //
      // This set no bitrate at all, so the browser chose its own — around
      // 2.5 Mbps for a camera stream. Over a seventy-minute interview that is
      // well past a gigabyte, and a camera image never compresses down the way
      // a mostly-static screen does. It exceeded the server's own 500MB limit,
      // let alone anything in front of it, and took longer than the upload
      // timeout however good the connection: the camera recording has never
      // once been stored, on any interview, while screen recordings of the
      // same interviews sometimes were.
      //
      // This is proctoring evidence of a face, not cinematography. The numbers
      // are config so they can be tuned without a redeploy.
      attach(stream);
      return stream;
    } catch (err) {
      console.error('Failed to start recording:', err);
      throw err;
    }
  }, [attach]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    clearWatchdog();
    // Guarded: in stream-only mode there is no recorder, and calling stop() on
    // one that never started throws.
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopAndGetBlob = useCallback((): Promise<Blob | null> => {
    stoppingRef.current = true;
    clearWatchdog();
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        // Also the stream-only path, where there is no recorder at all — the
        // camera still has to be released or its light stays on after the
        // interview ends.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const allChunks = chunksRef.current;
        resolve(
          allChunks.length > 0
            ? new Blob(allChunks, { type: recorder?.mimeType || 'video/webm' })
            : null
        );
        return;
      }

      recorder.onstop = () => {
        setIsRecording(false);
        const allChunks = chunksRef.current;
        resolve(
          allChunks.length > 0
            ? new Blob(allChunks, { type: recorder.mimeType || 'video/webm' })
            : null
        );
      };

      recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    });
  }, []);

  const getBlob = useCallback(() => {
    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: recorderRef.current?.mimeType || 'video/webm' });
  }, [chunks]);

  const reset = useCallback(() => {
    setChunks([]);
    chunksRef.current = [];
  }, []);

  return { isRecording, chunks, start, stop, stopAndGetBlob, getBlob, reset, stream: streamRef.current };
}
