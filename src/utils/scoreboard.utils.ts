/**
 * Per-candidate exam standing for a whole job: which papers each candidate was
 * set, how far they got, and what they scored against the mark their own paper
 * was assigned with.
 *
 * Built from the same helpers the result screens grade with — a candidate's
 * percentage has to read the same in the pipeline, in the results table and on
 * their own scorecard, and the only way to guarantee that is one calculation.
 */
import {
  orderedAttempts,
  orderedAssessments,
  submissionsForAttempt,
  buildCodingRows,
  splitResultsJson,
  aptitudeScorePercent,
  codingScorePercent,
  overallScorePercent,
  moduleVerdict,
  overallVerdict,
  passMarkOf,
} from './result.utils';
import type { Assessment, RawCodingQuestion } from '@/types/assessment.types';
import type { AptitudeAnswer, CodingAnswer, Result } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

export type ModuleKind = 'APTITUDE' | 'CODING';

/** Where one candidate stands on one module. */
export interface ModuleStanding {
  /** Was this paper ever set for them? */
  assigned: boolean;
  /** Have they sat it — i.e. is there a result to score? */
  sat: boolean;
  /** How many times it was set; more than one means a re-sit. */
  attempts: number;
  /** Percentage of the latest attempt, or null when it cannot be derived. */
  score: number | null;
  verdict: 'PASSED' | 'FAILED' | null;
  /** The mark this paper was assigned with, defaulted where it carries none. */
  passMark: number;
}

export interface CandidateStanding {
  email: string;
  aptitude: ModuleStanding;
  coding: ModuleStanding;
  overallScore: number | null;
  /** PARTIAL is "still pending", not a failure. */
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  /** Papers set but not yet sat — what "Exam Sent" is actually waiting on. */
  pending: ModuleKind[];
}

export interface ScoreboardInput {
  /** The candidates to stand up, so the work is bounded to who is on screen. */
  emails: string[];
  /** Every result on the job. */
  results: Result[];
  /** Every code run on the job. */
  submissions: CodeSubmissionResponse[];
  /** This job's assessments per candidate, keyed by lowercased email. */
  assessments: Map<string, Assessment[]>;
  /**
   * The job's coding paper. Null when it could not be read — the coding
   * percentage then stays null rather than being derived from a guessed
   * denominator.
   */
  codingPaper: RawCodingQuestion[] | null;
}

const EMPTY: ModuleStanding = {
  assigned: false,
  sat: false,
  attempts: 0,
  score: null,
  verdict: null,
  passMark: 0,
};

/**
 * Is this the paper the candidate actually sat?
 *
 * A result holds one entry per question on its paper, so a matching length is
 * good evidence. Where it does not match, the denominator is unknown and no
 * percentage is better than a wrong one.
 *
 * Only ever asked about a result that exists, so no entries at all is not a
 * candidate who never sat the paper — it is one who submitted with nothing
 * recorded against it, and the paper alone describes them: every question
 * unattempted, every test case failed, 0%.
 */
function paperFits(
  paper: RawCodingQuestion[] | null,
  answers: CodingAnswer[],
  assigned: boolean,
): boolean {
  if (paper === null || paper.length === 0) return false;
  return answers.length === 0 ? assigned : paper.length === answers.length;
}

export function buildCandidateStandings(input: ScoreboardInput): Map<string, CandidateStanding> {
  const { emails, results, submissions, assessments, codingPaper } = input;

  // Bucketed once rather than filtered per candidate — a job with 200 results
  // and 30 candidates would otherwise walk the list 60 times.
  const resultsByEmail = new Map<string, Result[]>();
  for (const result of results) {
    const key = (result.candidateEmail ?? '').toLowerCase();
    if (!key) continue;
    const list = resultsByEmail.get(key);
    if (list) list.push(result);
    else resultsByEmail.set(key, [result]);
  }

  const submissionsByEmail = new Map<string, CodeSubmissionResponse[]>();
  for (const submission of submissions) {
    const key = (submission.userEmail ?? '').toLowerCase();
    if (!key) continue;
    const list = submissionsByEmail.get(key);
    if (list) list.push(submission);
    else submissionsByEmail.set(key, [submission]);
  }

  const standings = new Map<string, CandidateStanding>();

  for (const email of emails) {
    const key = email.toLowerCase();
    if (!key || standings.has(key)) continue;

    const mine = orderedAssessments(assessments.get(key) ?? []);
    const aptitudePapers = mine.filter((a) => a.assessmentType === 'APTITUDE');
    const codingPapers = mine.filter((a) => a.assessmentType === 'CODING');

    const own = resultsByEmail.get(key) ?? [];
    const aptitudeAttempts = orderedAttempts(own, 'APTITUDE');
    const codingAttempts = orderedAttempts(own, 'CODING');
    const aptitudeResult = aptitudeAttempts[aptitudeAttempts.length - 1];
    const codingResult = codingAttempts[codingAttempts.length - 1];

    const ownSubmissions = submissionsByEmail.get(key) ?? [];

    // Assigned, or sat without a record of being assigned. The second half
    // matters for exams that predate the assessment records being kept — the
    // result is proof enough that the paper existed.
    const aptitudeAssigned = aptitudePapers.length > 0 || aptitudeAttempts.length > 0;
    const codingAssigned =
      codingPapers.length > 0 || codingAttempts.length > 0 || ownSubmissions.length > 0;

    const { answers: aptitudeAnswers } = splitResultsJson<AptitudeAnswer>(
      aptitudeResult?.resultsJson,
    );
    const { answers: codingAnswers } = splitResultsJson<CodingAnswer>(codingResult?.resultsJson);

    // The mark comes off the latest paper of that type — the one being scored.
    const aptitudePassMark = passMarkOf(aptitudePapers[aptitudePapers.length - 1]);
    const codingPassMark = passMarkOf(codingPapers[codingPapers.length - 1]);

    const aptitudeScore = aptitudeResult
      ? aptitudeScorePercent(aptitudeResult, aptitudeAnswers)
      : null;

    // Nothing is scored until it has been sat.
    //
    // The results screen deliberately reads an unopened coding paper as 0% —
    // there, every row is someone whose exam is over, and a paper they never
    // opened is a real zero that has to pull their average down. In the
    // pipeline it is the opposite: a candidate sitting at "Exam Sent" has a
    // window that is still open, and printing 0% FAILED beside their name
    // invites a rejection for something they have not failed yet.
    const usable = codingResult && paperFits(codingPaper, codingAnswers, codingAssigned);
    const codingScore = usable
      ? codingScorePercent(
          buildCodingRows(
            codingPaper ?? [],
            submissionsForAttempt(
              ownSubmissions,
              codingAttempts,
              codingResult,
              codingPapers[codingPapers.length - 1]?.id,
            ),
            codingAnswers,
          ),
          codingResult,
        )
      : null;

    const aptitude: ModuleStanding = aptitudeAssigned
      ? {
          assigned: true,
          sat: !!aptitudeResult,
          attempts: Math.max(aptitudePapers.length, aptitudeAttempts.length),
          score: aptitudeScore,
          verdict: moduleVerdict(aptitudeScore, aptitudePassMark),
          passMark: aptitudePassMark,
        }
      : EMPTY;

    const coding: ModuleStanding = codingAssigned
      ? {
          assigned: true,
          sat: !!codingResult,
          attempts: Math.max(codingPapers.length, codingAttempts.length),
          score: codingScore,
          verdict: moduleVerdict(codingScore, codingPassMark),
          passMark: codingPassMark,
        }
      : EMPTY;

    const overallScore = overallScorePercent([aptitude.score, coding.score]);

    // Only the bars for papers this candidate actually holds count towards the
    // overall, so an aptitude-only candidate is not held to a coding standard.
    const applicable = [
      ...(aptitude.sat ? [aptitudePassMark] : []),
      ...(coding.sat ? [codingPassMark] : []),
    ];

    standings.set(key, {
      email,
      aptitude,
      coding,
      overallScore,
      overallStatus: overallVerdict(overallScore, applicable) ?? 'PARTIAL',
      pending: [
        ...(aptitude.assigned && !aptitude.sat ? (['APTITUDE'] as ModuleKind[]) : []),
        ...(coding.assigned && !coding.sat ? (['CODING'] as ModuleKind[]) : []),
      ],
    });
  }

  return standings;
}
