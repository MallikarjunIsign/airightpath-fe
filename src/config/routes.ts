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
