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
  },
} as const;

export type ProctoringConfig = typeof PROCTORING_CONFIG;
