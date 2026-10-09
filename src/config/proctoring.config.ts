// ── Proctoring configuration ─────────────────────────────────────────
// All values are driven by Vite env vars (see .env.development / .env.production)
// so admins can tune exam proctoring per-environment WITHOUT code changes.
//
// Env vars (all optional — sensible defaults applied):
//   VITE_PROCTORING_CAMERA_REQUIRED      "true" | "false"   (default true)
//   VITE_PROCTORING_FULLSCREEN_ENABLED   "true" | "false"   (default true)
//   VITE_PROCTORING_TAB_SWITCH_ENABLED   "true" | "false"   (default true)
//   VITE_PROCTORING_MAX_TAB_SWITCHES     integer >= 0        (default 5, 0 = warn only)
//   VITE_PROCTORING_EYE_DETECTION_ENABLED "true" | "false"  (default true)
//   VITE_PROCTORING_MAX_EYE_WARNINGS     integer >= 0        (default 5, 0 = warn only)
//   VITE_PROCTORING_NOISE_ENABLED        "true" | "false"   (default true)
//   VITE_PROCTORING_NOISE_WARN_DB        negative dBFS      (default -45)
//   VITE_PROCTORING_NOISE_BLOCK_DB       negative dBFS      (default -32)
//   VITE_PROCTORING_NOISE_BLOCKS_START   "true" | "false"   (default true)
//   VITE_PROCTORING_PHOTO_REQUIRED       "true" | "false"   (default true)
//   VITE_PROCTORING_ROOM_SCAN_REQUIRED   "true" | "false"   (default false)
//   VITE_PROCTORING_MOBILE_REQUIRED      "true" | "false"   (default false)
//   VITE_PROCTORING_CAMERA_RECORDING_REQUIRED "true" | "false" (default true)
//   VITE_PROCTORING_SCREEN_RECORDING_REQUIRED "true" | "false" (default true)
//   VITE_PROCTORING_MOBILE_RECORDING_REQUIRED "true" | "false" (default true; only when a phone is paired)
//   VITE_PROCTORING_ROOM_WATCH_ENABLED   "true" | "false"   (default false)
//   VITE_PROCTORING_ROOM_WATCH_INTERVAL_MS integer ms       (default 8000)
//
// For the count values, 0 means "warn only, never auto-submit".

const env = import.meta.env;

/** Parse a boolean-ish env string. Accepts true/1/yes (case-insensitive). */
function parseBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return fallback;
}

/** Parse a non-negative integer env string, falling back on invalid input. */
function parseCount(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Parse a signed number env string (dBFS thresholds are negative). */
function parseNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const PROCTORING_CONFIG = {
  camera: {
    /** If true, the exam is blocked until the candidate grants camera access. */
    required: parseBool(env.VITE_PROCTORING_CAMERA_REQUIRED, true),
  },
  fullscreen: {
    /** If true, the exam requires (and re-prompts for) fullscreen mode. */
    enabled: parseBool(env.VITE_PROCTORING_FULLSCREEN_ENABLED, true),
  },
  tabSwitch: {
    /** If false, tab-switch monitoring is disabled entirely. */
    enabled: parseBool(env.VITE_PROCTORING_TAB_SWITCH_ENABLED, true),
    /** Auto-submit once tab switches reach this count. 0 = warn only. */
    maxBeforeAutoSubmit: parseCount(env.VITE_PROCTORING_MAX_TAB_SWITCHES, 5),
  },
  eyeDetection: {
    /** If false, face/eye detection (and model loading) is skipped entirely. */
    enabled: parseBool(env.VITE_PROCTORING_EYE_DETECTION_ENABLED, true),
    /** Auto-submit once face/eye warnings reach this count. 0 = warn only. */
    maxBeforeAutoSubmit: parseCount(env.VITE_PROCTORING_MAX_EYE_WARNINGS, 5),
    /**
     * Milliseconds between face-detection checks (the detection cadence). Grace
     * before a warning is derived per category from this: "no face" needs 4
     * consecutive misses (≈16s of grace for brief look-aways) while "multiple
     * faces" needs only 2 (≈8s — a second person is flagged promptly).
     */
    checkIntervalMs: parseCount(env.VITE_PROCTORING_EYE_CHECK_INTERVAL_MS, 4000),
    /**
     * Whether looking down counts as looking away.
     *
     * Off, because the exam is typed. A candidate writing code looks at their
     * keyboard, and at the default sensitivity that is a warning every eight
     * seconds — five of them auto-submitted the paper. The behaviour being
     * punished was "typing", which is the one thing the exam asks for.
     *
     * The detector cannot tell a glance at the keyboard from a glance at notes
     * in your lap, so this is a real reduction in coverage and not a free one.
     * It is the right trade anyway: the signals that actually catch cheating —
     * nobody in the seat, a second face, a head turned to another screen — are
     * all still on, and a check that fires constantly on honest candidates is
     * not providing coverage, it is providing noise. Turn it back on where the
     * paper is read rather than typed.
     */
    flagLookingDown: parseBool(env.VITE_PROCTORING_FLAG_LOOKING_DOWN, false),
    /**
     * Consecutive checks a sideways glance must persist before it warns.
     * Three at the 4s cadence is ~12s of a head held turned away, which is
     * looking at something, not glancing at a clock.
     */
    lookAwayConsecutiveChecks: parseCount(env.VITE_PROCTORING_LOOK_AWAY_CHECKS, 3),
    /**
     * Consecutive checks with no face found before it warns.
     *
     * Six (~24s) rather than four. The detector loses a head tilted down over
     * a keyboard, so a short miss is as likely to mean "typing" as "gone", and
     * this shares the same warning budget that auto-submits the paper. The
     * counter resets the moment a face is seen again, so a genuinely empty
     * seat still crosses it quickly.
     */
    noFaceConsecutiveChecks: parseCount(env.VITE_PROCTORING_NO_FACE_CHECKS, 6),
  },
  /**
   * Background-noise check on the exam instructions screen. Thresholds are in
   * dBFS (0 = clipping, more negative = quieter), measured as a smoothed RMS of
   * the live mic signal:
   *   quieter than warnDb    → green  ("Quiet")
   *   warnDb … blockDb       → amber  ("Some background noise" — start allowed)
   *   louder than blockDb    → red    ("Too noisy" — start blocked)
   * A level only counts as red once it is *sustained*, so a door slam or a cough
   * cannot lock a candidate out of their exam.
   */
  noise: {
    enabled: parseBool(env.VITE_PROCTORING_NOISE_ENABLED, true),
    warnDb: parseNumber(env.VITE_PROCTORING_NOISE_WARN_DB, -45),
    blockDb: parseNumber(env.VITE_PROCTORING_NOISE_BLOCK_DB, -32),
    /** Milliseconds the level must stay above blockDb before it reads red. */
    sustainMs: parseCount(env.VITE_PROCTORING_NOISE_SUSTAIN_MS, 1500),
    /** If false, a red level is shown as advice only and never blocks the start. */
    blocksStart: parseBool(env.VITE_PROCTORING_NOISE_BLOCKS_START, true),
  },
  /**
   * Identity photo taken before the exam: one face, captured from the live
   * preview and stored against the assessment. A second person in frame blocks
   * both the capture and the exam start.
   *
   * Same two-state rule as the room scan below — the step is either asked for
   * properly or not shown at all. A photo the candidate may decline proves
   * nothing about who sat the exam, so there is no "optional but visible" mode.
   */
  identityPhoto: {
    /**
     * true → shown and mandatory; false → not part of the check at all.
     *
     * "Mandatory" includes being stored: a photo sitting in a browser tab is no
     * evidence of who sat the exam, so a failed upload is retried rather than
     * accepted. Until the backend endpoint exists, set this to false — that is
     * the switch for "we can't store photos yet", not a separate flag.
     */
    required: parseBool(env.VITE_PROCTORING_PHOTO_REQUIRED, true),
    /** Longest edge of the stored image, in pixels. */
    maxWidth: parseCount(env.VITE_PROCTORING_PHOTO_MAX_WIDTH, 640),
  },
  /**
   * Guided room scan: the candidate slowly turns the camera through a full
   * circle while frames are captured.
   *
   * Whether it is required is decided here, and "optional" means the step is not
   * shown at all rather than offered as something safe to skip — a scan the
   * candidate can decline is one nobody performs, so the UI does not spend their
   * attention on it. Turn it on only where the room really must be seen.
   */
  roomScan: {
    /** true → shown and mandatory; false → not part of the check at all. */
    required: parseBool(env.VITE_PROCTORING_ROOM_SCAN_REQUIRED, false),
    /** Frames captured across the sweep (8 ≈ one every 45°). */
    frames: parseCount(env.VITE_PROCTORING_ROOM_SCAN_FRAMES, 8),
    /** How long the candidate is given to complete the full turn. */
    durationMs: parseCount(env.VITE_PROCTORING_ROOM_SCAN_DURATION_MS, 16000),
  },
  /**
   * What is captured for the whole length of an interview, as opposed to the
   * one-off photo and sweep above.
   *
   * Each stream is either asked for or skipped outright — there is no "offer it
   * and shrug when it is declined". A recording a candidate can wave away is
   * not evidence, and the browser prompt it costs them is worse than useless if
   * the answer does not matter. Turn a stream off where it is not wanted and
   * the candidate is never prompted for it at all.
   */
  recording: {
    /**
     * The candidate's camera and microphone, recorded and uploaded with the
     * interview. False also skips the upload — the camera itself may still be
     * opened for face detection, which is a separate switch.
     */
    camera: {
      required: parseBool(env.VITE_PROCTORING_CAMERA_RECORDING_REQUIRED, true),
      /**
       * How heavy the camera recording is allowed to be.
       *
       * <p>No bitrate was set, so the browser picked its own — about 2.5 Mbps.
       * Seventy minutes of that is over a gigabyte, which exceeded the
       * server's own 500MB limit before anything in front of it got a say, and
       * took longer to send than the upload timeout allowed. The camera
       * recording had never once been stored on any interview.</p>
       *
       * <p>500 kbps is ample for what this is: evidence that a particular
       * person sat the interview, not footage anyone will watch for detail. It
       * puts a seventy-minute recording around 280MB. vp8 rather than vp9
       * because the encode runs on the candidate's machine alongside a live
       * voice call and face detection.</p>
       */
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: parseCount(env.VITE_PROCTORING_CAMERA_VIDEO_BITRATE, 700_000),
      audioBitsPerSecond: parseCount(env.VITE_PROCTORING_CAMERA_AUDIO_BITRATE, 48_000),
      /**
       * What the camera is asked to capture, as opposed to how hard it is
       * compressed afterwards.
       *
       * <p>The stream was requested as a bare {@code video: true}, so the
       * browser chose — often 720p at 30fps. Capping the bitrate alone makes
       * a high-resolution capture look worse rather than cost less, because
       * the encoder spends the same budget on more pixels. Asking for less in
       * the first place is what actually improves the picture per byte.</p>
       *
       * <p>640x360 at 15fps is a video call. It is unambiguous evidence of who
       * sat the interview, which is the entire job here — nobody is going to
       * study the footage frame by frame. Together with the bitrate above, a
       * seventy-minute recording lands near 175MB rather than the gigabyte-plus
       * it was.</p>
       */
      width: parseCount(env.VITE_PROCTORING_CAMERA_WIDTH, 640),
      height: parseCount(env.VITE_PROCTORING_CAMERA_HEIGHT, 360),
      frameRate: parseCount(env.VITE_PROCTORING_CAMERA_FRAMERATE, 15),
    },
    /**
     * The candidate's screen, via the browser's display-capture prompt. False
     * skips the prompt entirely, and the interview no longer reports a stopped
     * or denied share as a proctoring event — there is nothing to stop.
     */
    screen: {
      required: parseBool(env.VITE_PROCTORING_SCREEN_RECORDING_REQUIRED, true),
    },
    /**
     * The paired phone's camera, recorded and stored with the interview. Applies
     * only where a phone is paired;
     * whether pairing itself is needed is `mobileCompanion.required`.
     *
     * Recorded on the phone itself, from its own camera, and uploaded from there
     * under the pairing token the candidate's browser registered. That is what
     * makes it independent of the live picture: the recording exists whether or
     * not the stream ever reached the interview screen.
     */
    mobile: {
      required: parseBool(env.VITE_PROCTORING_MOBILE_RECORDING_REQUIRED, true),
      videoBitsPerSecond: parseCount(env.VITE_PROCTORING_MOBILE_VIDEO_BITRATE, 500_000),
    },
  },
  /**
   * The phone used as a second camera during an interview.
   *
   * Defaults to false, which is how it has always behaved: the candidate is
   * shown the QR code and can begin without pairing. That was the only option —
   * there was no switch at all — so an interview meant to be watched from a
   * second angle could be sat with the phone step skipped and nothing recorded
   * it as skipped. Setting this true makes pairing a condition of starting.
   */
  mobileCompanion: {
    required: parseBool(env.VITE_PROCTORING_MOBILE_REQUIRED, false),
    /**
     * Whether the paired phone also offers its microphone as an input.
     *
     * A laptop's built-in microphone is often the worst part of an interview:
     * far from the candidate, close to the fan, and pointing at the screen. The
     * phone is already paired, already in the room and has a much better one.
     * With this on, the phone sends an audio track alongside its video and the
     * candidate can answer through it instead.
     *
     * Off by default, and never automatic even when on. The phone may be across
     * the room on a stand, where switching to it silently would make every
     * answer distant and unintelligible — with the candidate given no reason
     * why. They choose, and the device microphone stays the default.
     */
    audio: parseBool(env.VITE_PROCTORING_MOBILE_AUDIO_ENABLED, false),
    /**
     * Watch the phone's room angle for a second person.
     *
     * <p>Face detection has only ever looked at the laptop camera, which sees
     * the candidate's face and little else. The phone is the wide shot — it is
     * pointed at the room precisely so somebody off to the side is visible —
     * and nothing was watching it. Someone sitting just outside the laptop's
     * frame was invisible to every check the interview ran.</p>
     *
     * <p>Records and warns; never ends the interview. A room angle picks up
     * far more innocent movement than a face-on camera — someone walking past
     * an open door, a reflection, a poster — and ending a real interview on
     * that would be worse than the cheating it is meant to catch. The event
     * lands on the reviewer's transcript to judge in context.</p>
     */
    roomWatch: {
      enabled: parseBool(env.VITE_PROCTORING_ROOM_WATCH_ENABLED, false),
      /**
       * Slower than the face check on purpose. This is looking for a person in
       * the room, which does not appear and vanish between frames, and the
       * detection runs on the candidate's machine alongside a live voice call.
       */
      checkIntervalMs: parseCount(env.VITE_PROCTORING_ROOM_WATCH_INTERVAL_MS, 8000),
    },
  },
} as const;

export type ProctoringConfig = typeof PROCTORING_CONFIG;
