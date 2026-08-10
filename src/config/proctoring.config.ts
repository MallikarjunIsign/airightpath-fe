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
} as const;

export type ProctoringConfig = typeof PROCTORING_CONFIG;
