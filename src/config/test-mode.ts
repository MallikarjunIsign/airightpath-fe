import { ROUTES } from './routes';

/**
 * Test Mode — the four candidate journeys an admin can rehearse.
 *
 * The point of the feature is to answer "what does a candidate actually see?"
 * without assigning anyone an exam. So every mode here walks the same stages
 * the real flow does (setup → instructions → device and identity check → the
 * activity itself → the result screen) and writes nothing anywhere: no rows,
 * no uploads, no session storage. Reloading the page is the reset button.
 *
 * One registry rather than a list per consumer, so the sidebar, the hub cards
 * and the pages themselves cannot disagree about what exists.
 */

/** Stable ids — used as React keys and to look a mode up from its route. */
export type TestModeId =
  | 'aptitude'
  | 'coding'
  | 'interview-technical'
  | 'interview-behavioral';

export type TestModeGroup = 'Assessments' | 'Interview';

export interface TestModeDefinition {
  id: TestModeId;
  group: TestModeGroup;
  /** Sidebar/card label. */
  label: string;
  /** One line on the hub card, saying what this rehearses. */
  blurb: string;
  path: string;
}

/**
 * Interview modes map onto real `InterviewPhase` values, not invented round
 * names. The AI interview is a single session that moves through
 * INTRODUCTION → BACKGROUND → TECHNICAL → PROBLEM_SOLVING → BEHAVIORAL →
 * CLOSING, so "technical round" and "HR round" are, in this system, the
 * TECHNICAL and BEHAVIORAL phases. Naming them anything else here would invent
 * a concept the backend does not have.
 */
export const TEST_MODES: readonly TestModeDefinition[] = [
  {
    id: 'aptitude',
    group: 'Assessments',
    label: 'Aptitude',
    blurb: 'Multiple-choice paper: instructions, proctoring check, timed exam, scored result.',
    path: ROUTES.ADMIN.TEST_MODE_APTITUDE,
  },
  {
    id: 'coding',
    group: 'Assessments',
    label: 'Coding',
    blurb: 'Coding paper: problem statements, test cases and the editor a candidate types into.',
    path: ROUTES.ADMIN.TEST_MODE_CODING,
  },
  {
    id: 'interview-technical',
    group: 'Interview',
    label: 'Technical',
    blurb: 'The TECHNICAL phase of the AI interview — role-specific questions, camera and transcript.',
    path: ROUTES.ADMIN.TEST_MODE_INTERVIEW_TECHNICAL,
  },
  {
    id: 'interview-behavioral',
    group: 'Interview',
    label: 'Behavioral',
    blurb: 'The BEHAVIORAL phase — STAR-format questions, the round often called the HR round.',
    path: ROUTES.ADMIN.TEST_MODE_INTERVIEW_BEHAVIORAL,
  },
] as const;

/** Group order for the sidebar submenu and the hub, mirroring TEST_MODES. */
export const TEST_MODE_GROUPS: readonly TestModeGroup[] = ['Assessments', 'Interview'];

export function testModesInGroup(group: TestModeGroup): TestModeDefinition[] {
  return TEST_MODES.filter((mode) => mode.group === group);
}

/**
 * The banner text every Test Mode screen carries. Kept here so the promise is
 * worded identically everywhere — an admin who half-remembers whether test
 * runs count towards a candidate's record should be able to read the answer off
 * whichever screen they are on.
 */
export const TEST_MODE_NOTICE =
  'Nothing here is saved. No result is recorded, no photo is uploaded, and no candidate is affected. Reloading the page starts over.';
