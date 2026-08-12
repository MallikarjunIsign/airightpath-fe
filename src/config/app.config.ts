export const APP_CONFIG = {
  HTTP_TIMEOUT_MS: 30000,
  AI_GENERATION_TIMEOUT_MS: 330000,
  ASSIGN_TIMEOUT_MS: 120000,
  /**
   * Derived from the server's own limits, not picked by feel. Backend config:
   *   compiler.total-timeout-seconds = 45   (whole submission, execution only)
   *   compiler.max-parallel-runs     = 4    (concurrent submissions)
   *
   * Execution is bounded at 45s, but a submission arriving when all four slots
   * are busy waits for one — so the worst honest round trip is ~45s queued plus
   * ~45s running. 120s covers that with headroom.
   *
   * The direction of the inequality is what matters: below the server's bound,
   * this client aborts work the server is still validly doing, and the
   * candidate gets a generic "try again" for a perfectly good program because
   * the typed error was never read. Above it, the server's own limit always
   * fires first and every failure arrives with a real reason attached.
   *
   * A client timeout cannot simply be removed — without one a request lost in
   * transit spins forever. But if real responses ever approach 180s, that is
   * backend capacity to fix, not a number to raise here.
   */
  COMPILE_TIMEOUT_MS: 120000,
  TOKEN_EXPIRY_SKEW_SECONDS: 30,
  MAX_FILE_SIZE_MB: 2,
  MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024,
  SUPPORTED_RESUME_TYPES: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  SUPPORTED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif"],
  COMPILER_LANGUAGES: [
    { value: "java", label: "Java" },
    { value: "python", label: "Python" },
    { value: "c", label: "C" },
    { value: "cpp", label: "C++" },
    { value: "javascript", label: "JavaScript" },
  ],
  // Fallback exam length, used only when the question count is unknown (the
  // paper failed to load, or a legacy assignment carries no timing config).
  // The real duration is per-question — see the three values below.
  EXAM_TIMER_MINUTES: 120,
  // Per-question time. The exam clock is questionCount x these minutes, so the
  // duration follows the paper: add questions and the exam grows to match.
  // Admins can override per assignment on the Assign Assessment screen.
  APTITUDE_MINUTES_PER_QUESTION: 1,
  CODING_MINUTES_PER_QUESTION: 25,
  EXAM_MIN_MINUTES_PER_QUESTION: 1,
  EXAM_MAX_MINUTES_PER_QUESTION: 180,
  INTERVIEW_TIMER_MINUTES: 60,
  INTERVIEW_QUESTION_TIMER_MINUTES: 5,
  FACE_DETECTION_MAX_WARNINGS: 999999,
  PROCTORING_MAX_TOTAL_WARNINGS: 9999999,
  VIDEO_CHUNK_SECONDS: 15,
  AUDIO_CHUNK_SECONDS: 4,
  AUDIO_CHUNK_MIME_TYPE: "audio/webm;codecs=opus",
  INTERVIEW_MAX_PROCTORING_WARNINGS: 999999,
  INTERVIEW_INACTIVITY_WARNING_SECONDS: 120,
  INTERVIEW_INACTIVITY_TIMEOUT_SECONDS: 180,
  FACE_DETECTION_INTERVAL_MS: 10000,
  FACE_LOOKING_AWAY_THRESHOLD: 9999,
  FACE_LOOKING_DOWN_THRESHOLD: 99999,
  FACE_LOOKING_AWAY_CONSECUTIVE_FRAMES: 2,
  DEVTOOLS_CHECK_INTERVAL_MS: 1000,
  DEBOUNCE_MS: 300,
  TOAST_DURATION_MS: 5000,
  PAGINATION_DEFAULT_SIZE: 10,
  WS_RECONNECT_MAX_ATTEMPTS: 10,
  WS_RECONNECT_BASE_DELAY_MS: 1000,
  WS_RECONNECT_MAX_DELAY_MS: 30000,
  INTERVIEW_PROCESSING_TIMEOUT_MS: 45000,
  INTERVIEW_INSTRUCTION_COUNTDOWN_SECONDS: 30,
  INTERVIEW_QUESTION_TIMEOUT_SECONDS: 300,
  INTERVIEW_CODING_QUESTION_TIMEOUT_SECONDS: 600,
  INTERVIEW_ANSWER_TIMEOUT_SECONDS: 600,
  INTERVIEW_MAX_CONSECUTIVE_SKIPS: 3,
} as const;
