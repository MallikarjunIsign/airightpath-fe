/**
 * Permission names as used in `hasPermission` checks.
 *
 * NOTE: this map has drifted from the backend's `PermissionName` enum — several
 * entries below (USER_WRITE, USER_DELETE, ASSESSMENT_WRITE, JOB_READ, …) do not
 * exist server-side, and several real ones are still missing. Only add names
 * that the backend actually grants, or the check silently never passes.
 */
export const PERMISSIONS = {
  USER_READ: 'USER_READ',
  /** Listing accounts. Seeded to SUPER_ADMIN only. */
  USER_LIST: 'USER_LIST',
  /** Granting roles and creating staff accounts. SUPER_ADMIN only. */
  ROLE_MANAGE: 'ROLE_MANAGE',
  /** Enabling an account. SUPER_ADMIN only. */
  USER_ACTIVATE: 'USER_ACTIVATE',
  /** Disabling an account. SUPER_ADMIN only. */
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_WRITE: 'USER_WRITE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  ASSESSMENT_READ: 'ASSESSMENT_READ',
  ASSESSMENT_WRITE: 'ASSESSMENT_WRITE',
  JOB_READ: 'JOB_READ',
  JOB_WRITE: 'JOB_WRITE',
  ATS_READ: 'ATS_READ',
  ATS_WRITE: 'ATS_WRITE',
  INTERVIEW_READ: 'INTERVIEW_READ',
  INTERVIEW_WRITE: 'INTERVIEW_WRITE',
  QUESTION_READ: 'QUESTION_READ',
  QUESTION_WRITE: 'QUESTION_WRITE',
  RESULT_READ: 'RESULT_READ',
  RESULT_WRITE: 'RESULT_WRITE',
  PROMPT_READ: 'PROMPT_READ',
  PROMPT_WRITE: 'PROMPT_WRITE',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
