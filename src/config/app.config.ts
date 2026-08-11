export const APP_CONFIG = {
  HTTP_TIMEOUT_MS: 30000,
  AI_GENERATION_TIMEOUT_MS: 330000,
  ASSIGN_TIMEOUT_MS: 120000,
  // The backend now kills a runaway program in ~5s and answers, so the old
  // 2-minute ceiling only meant a candidate sat watching a spinner when the
  // request itself was lost. Kept well above the execution limit so a cold
  // container or slow network is not mistaken for an infinite loop.
  COMPILE_TIMEOUT_MS: 30000,
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
