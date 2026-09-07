export const ROUTES = {
  PUBLIC: {
    HOME: '/',
    LOGIN: '/login',
    REGISTER: '/register',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
    ABOUT: '/about',
    CONTACT: '/contact',
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    JOBS: '/admin/jobs',
    JOBS_CREATE: '/admin/jobs/create',
    JOBS_EDIT: '/admin/jobs/:jobPrefix/edit',
    jobsEdit: (jobPrefix: string) => `/admin/jobs/${encodeURIComponent(jobPrefix)}/edit`,
    CANDIDATES: '/admin/candidates',
    USERS: '/admin/users',
    ATS: '/admin/ats',
    ATS_BATCH: '/admin/ats/batch',
    ASSESSMENTS_ASSIGN: '/admin/assessments/assign',
    ASSESSMENTS_UPLOAD: '/admin/assessments/upload',
    ASSESSMENTS_RESULTS: '/admin/assessments/results',
    CANDIDATE_RESULT_DETAIL: '/admin/assessments/results/:jobPrefix/:email',
    candidateResultDetail: (jobPrefix: string, email: string) =>
      `/admin/assessments/results/${encodeURIComponent(jobPrefix)}/${encodeURIComponent(email)}`,
    INTERVIEWS_SCHEDULE: '/admin/interviews/schedule',
    INTERVIEWS_RESULTS: '/admin/interviews/results',
    PROMPTS: '/admin/prompts',
    PROFILE: '/admin/profile',
    CHANGE_PASSWORD: '/admin/change-password',
  },
  CANDIDATE: {
    DASHBOARD: '/candidate/dashboard',
    PROFILE: '/candidate/profile',
    CHANGE_PASSWORD: '/candidate/change-password',
    RESUME: '/candidate/resume',
    EVENTS: '/candidate/events',
    APPLICATIONS: '/candidate/applications',
    APPLY: '/candidate/apply',
    APPLY_JOB: '/candidate/apply/:jobPrefix',
    ASSESSMENTS: '/candidate/assessments',
    INSTRUCTIONS: '/candidate/instructions',
    EXAM_APTITUDE: '/candidate/exam/aptitude',
    EXAM_CODING: '/candidate/exam/coding',
    INTERVIEWS: '/candidate/interviews',
    INTERVIEW: '/candidate/interview',
    INTERVIEW_SUMMARY: '/candidate/interview/summary',
    RESULTS: '/candidate/results',
    RESULT_DETAIL: '/candidate/results/:id',
  },
  ERRORS: {
    UNAUTHORIZED: '/unauthorized',
    FORBIDDEN: '/forbidden',
  },
} as const;

/** Relative apply path for a specific job, e.g. `/candidate/apply/DEV-2024-001`. */
export function applyJobPath(jobPrefix: string): string {
  return `/candidate/apply/${encodeURIComponent(jobPrefix)}`;
}

/** Absolute, shareable apply URL for a specific job (includes the current origin). */
export function applyJobUrl(jobPrefix: string): string {
  return `${window.location.origin}${applyJobPath(jobPrefix)}`;
}

/**
 * The route a signed-in user belongs on when no specific destination was asked
 * for — after login, or when they land on a public/auth-only page. Admins get
 * the admin dashboard, everyone else the candidate one.
 */
export function getDefaultDashboard(roles: readonly string[]): string {
  const isAdmin = roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  return isAdmin ? ROUTES.ADMIN.DASHBOARD : ROUTES.CANDIDATE.DASHBOARD;
}

/** Routes a signed-in user must never be redirected back onto. */
const AUTH_ONLY_PATHS: readonly string[] = [
  ROUTES.PUBLIC.HOME,
  ROUTES.PUBLIC.LOGIN,
  ROUTES.PUBLIC.REGISTER,
  ROUTES.PUBLIC.FORGOT_PASSWORD,
  ROUTES.PUBLIC.RESET_PASSWORD,
  ROUTES.ERRORS.UNAUTHORIZED,
  ROUTES.ERRORS.FORBIDDEN,
];

/**
 * Where to send a user after they sign in: back to the page that bounced them
 * to login, or their role's dashboard. `from` is ignored when it points at an
 * auth page, which would otherwise bounce them straight back to login.
 */
export function resolvePostLoginPath(
  roles: readonly string[],
  from?: string | null
): string {
  if (from && from.startsWith('/') && !AUTH_ONLY_PATHS.includes(from.split('?')[0])) {
    return from;
  }
  return getDefaultDashboard(roles);
}
