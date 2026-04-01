const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  AUTH_BAD_REQUEST: 'Something was wrong with your request. Please check and try again.',
  AUTH_UNAUTHORIZED: 'Invalid email or password. Please try again.',
  AUTH_INVALID_TOKEN: 'Your session has expired. Please sign in again.',
  AUTH_INVALID_REFRESH: 'Your session has expired. Please sign in again.',
  AUTH_REFRESH_REUSE_DETECTED: 'For your security, this session has been terminated. Please sign in again.',
  AUTH_FORBIDDEN: "You don't have permission to do that.",
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again in a moment.',
  // Domain
  USER_NOT_FOUND: "We couldn't find an account with that email address.",
  USER_ALREADY_EXISTS: 'An account with this email already exists. Try signing in instead.',
  USER_INACTIVE: 'This account has been deactivated. Please contact support.',
  PASSWORD_POLICY: 'Password must be between 8 and 64 characters.',
  PASSWORD_MISMATCH: "The passwords you entered don't match.",
  STORAGE_ERROR: 'There was a problem saving your file. Please try again.',
  INVALID_OTP: 'That code is invalid or has expired. Please request a new one.',
  // Resources
  JOB_NOT_FOUND: "That job posting couldn't be found. It may have been removed.",
  ASSESSMENT_NOT_FOUND: 'Assessment not found. Please check and try again.',
  ASSESSMENT_EXPIRED: 'This assessment has expired and is no longer available.',
  APPLICATION_DEADLINE_PASSED: 'The application deadline for this job has passed.',
  INTERVIEW_NOT_FOUND: 'Interview not found. Please check and try again.',
  // Files
  FILE_TOO_LARGE: 'That file is too large. Please choose a smaller file.',
  INVALID_FILE_TYPE: "That file type isn't supported. Please choose a different file.",
  // Network
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection and try again.',
  TIMEOUT_ERROR: 'The request took too long. Please try again.',
};

export function getErrorMessage(code?: string, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  return fallback || 'Something went wrong. Please try again.';
}
