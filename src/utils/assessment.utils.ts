/**
 * Shared reading of a candidate's assessment records — the papers assigned to
 * them, as opposed to the results those papers produced.
 */
import { groupRounds } from './result.utils';
import type { Assessment } from '@/types/assessment.types';

/**
 * An assessment list from the API, however it happens to be wrapped.
 *
 * The list endpoints in this API are inconsistent about the `{ data: [...] }`
 * envelope, and calling `.filter` on the wrapper throws — which reads to the
 * caller as "this candidate has no assessments" rather than as a shape it
 * failed to unwrap.
 */
export function toAssessmentList(body: unknown): Assessment[] {
  if (Array.isArray(body)) return body as Assessment[];
  const inner = (body as { data?: unknown })?.data;
  return Array.isArray(inner) ? (inner as Assessment[]) : [];
}

/** When a paper was handed to the candidate. */
function assignedTime(assessment: Assessment): number | null {
  const stamp = assessment.assignedAt ?? assessment.startTime;
  const time = stamp ? new Date(stamp).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * A candidate's papers on one job, grouped into the rounds they were assigned
 * in — attempt 1, attempt 2.
 *
 * Aptitude and coding handed over in the same action are one attempt; the
 * moment a module is assigned a second time, a new attempt begins. Grouped the
 * same way the result screen groups the attempts those papers produced, so the
 * two screens cannot disagree about what "attempt 2" means.
 */
export function groupAssignmentRounds(assessments: Assessment[]): Assessment[][] {
  return groupRounds(assessments, (a) => a.assessmentType, assignedTime);
}

/** How far a candidate got with one assigned paper. */
export type AssignmentState = 'sat' | 'expired' | 'pending';

export function assignmentState(assessment: Assessment): AssignmentState {
  if (assessment.examAttended) return 'sat';
  // Expired is only worth saying about a paper that was never sat — an attended
  // one passing its deadline afterwards is just an exam that has been and gone.
  if (assessment.expired) return 'expired';
  return 'pending';
}
