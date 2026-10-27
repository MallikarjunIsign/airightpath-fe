import type { JobApplicationDTO } from '@/types/job.types';

/** Resolve a candidate's email from either `email` or the legacy `userEmail`. */
export function getAppEmail(app: JobApplicationDTO): string {
  return app.email || app.userEmail || '';
}
