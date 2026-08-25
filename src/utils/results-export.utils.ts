import type { Result, SubmissionMeta } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';
import { splitResultsJson } from '@/utils/result.utils';

/**
 * Builds the Assessment Results workbook.
 *
 * ExcelJS is pulled in with a dynamic import inside {@link buildResultsWorkbook}
 * rather than at module scope: it is a large dependency used by one button on
 * one admin screen, and a static import would put it in the bundle every
 * candidate downloads to sit an exam.
 *
 * Cells carry typed values, never display strings — scores are real numbers
 * under a percent format and dates are real dates. A sheet of text that merely
 * looks like a number cannot be sorted, filtered or averaged, which is most of
 * why a recruiter asked for Excel instead of a screenshot.
 */

/** One aggregated candidate, as the results table renders them. */
export interface ExportCandidateRow {
  email: string;
  /** Every attempt at each module, oldest first; the results below are the latest. */
  aptitudeAttempts?: Result[];
  codingAttempts?: Result[];
  aptitudeResult?: Result;
  codingResult?: Result;
  codeSubmissions: CodeSubmissionResponse[];
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  hasCoding: boolean;
  aptitudeScore: number | null;
  codingScore: number | null;
  overallScore: number | null;
  /** Derived from the percentage against the paper's pass mark, as on screen. */
  aptitudeVerdict: 'PASSED' | 'FAILED' | null;
  codingVerdict: 'PASSED' | 'FAILED' | null;
  /** The application behind the email; absent if it could not be loaded. */
  profile?: ExportCandidateProfile;
  /** When each paper's exam window opened, as scheduled at assign time. */
  aptitudeStart?: string;
  codingStart?: string;
  /** Question counts behind the aptitude percentage. */
  aptitudeSummary?: { total: number; answered: number; correct: number };
  /** Coding grouped by the paper's difficulty labels; empty when unavailable. */
  codingBands?: ExportCodingBand[];
  /** One entry per coding question, paired with whatever was run against it. */
  codingQuestions?: ExportCodingQuestion[];
  /** The aptitude answer sheet, question by question. */
  aptitudeAnswerSheet?: ExportAptitudeAnswer[];
}

/** One aptitude question as the candidate left it. */
export interface ExportAptitudeAnswer {
  number: number;
  question: string;
  difficulty: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  answered: boolean;
  marks: number | null;
}

/** A single coding question and how the candidate fared on it. */
export interface ExportCodingQuestion {
  label: string;
  title: string;
  difficulty: string;
  language?: string;
  outcome: 'pass' | 'fail' | 'skip';
  testsPassed: number;
  testsTotal: number;
  submittedAt?: string;
  /** The code as submitted — the coding half of the answer sheet. */
  code: string;
}

/** One difficulty band of a candidate's coding paper. */
export interface ExportCodingBand {
  name: string;
  questions: number;
  solved: number;
  attempted: number;
  testsPassed: number;
  testsTotal: number;
}

/** The person behind the email, for the Candidate Details sheet. */
export interface ExportCandidateProfile {
  firstName?: string;
  lastName?: string;
  email?: string;
  userEmail?: string;
  mobileNumber?: string;
  experience?: string;
  jobRole?: string;
  referralId?: string | null;
  referralName?: string | null;
  referralStatus?: string | null;
}

export interface ResultsExportFilters {
  /** Human label, e.g. "Passed". "All statuses" counts as unset. */
  status: string;
  /** Email substring; '' when unset. */
  search: string;
  /** Submitted-between in words, e.g. "14/08/2026 to 16/08/2026"; '' when unset. */
  dateRange?: string;
}

/** Whether any filter narrowed the export, so it can be labelled as a subset. */
function isFiltered(filters?: ResultsExportFilters): filters is ResultsExportFilters {
  if (!filters) return false;
  return filters.status !== 'All statuses' || filters.search !== '' || !!filters.dateRange;
}

export interface ResultsExportInput {
  jobTitle: string;
  jobPrefix: string;
  /** The rows to export — already filtered, exactly as the table shows them. */
  rows: ExportCandidateRow[];
  /** Candidates on the job before filtering, so a subset can say what it is a subset of. */
  totalCandidates?: number;
  /** The filter in force, recorded so a partial export is never read as the whole cohort. */
  filters?: ResultsExportFilters;
  /** Stamped into the Summary sheet; passed in so the caller owns the clock. */
  generatedAt: Date;
}

const HEADER_FILL = 'FF0F7B3F';
const BORDER_TINT = 'FFD8E4DC';

/** Percentages are stored as fractions so Excel treats them as real percents. */
const PERCENT_FORMAT = '0%';
const DATE_FORMAT = 'dd mmm yyyy hh:mm';

/**
 * A score of 0 is a real result and must survive; only a genuinely absent one
 * becomes a blank cell. Returning `null` for both would file a candidate who
 * scored nothing alongside one who was never set the paper.
 */
function percentCell(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value / 100;
}

/**
 * A spreadsheet date is a wall-clock reading with no timezone attached, and
 * ExcelJS derives the serial it stores from the instant's UTC value. Handing it
 * a local Date therefore writes the UTC time: a 10:30 IST submission was landing
 * in the sheet as 05:00. Offsetting first makes the UTC value equal the local
 * reading, so the cell shows the time the recruiter expects.
 *
 * The offset is taken from the date itself, so a timezone with DST shifts by the
 * amount in force on that day rather than today's.
 */
function toExcelWallClock(date: Date): Date {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}

/** Excel sorts real dates; a formatted string sorts alphabetically. */
function dateCell(raw?: string): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : toExcelWallClock(parsed);
}

/** Test cases across every graded submission this candidate made. */
function testCaseTally(row: ExportCandidateRow): { passed: number; total: number } {
  let passed = 0;
  let total = 0;
  for (const submission of row.codeSubmissions) {
    for (const test of submission.testResults ?? []) {
      total += 1;
      if (test.passed) passed += 1;
    }
  }
  return { passed, total };
}

/**
 * Module status in words. The four cases are distinct and a reader must be able
 * to tell them apart: never assigned, assigned but never sat, sat but not
 * gradeable, and graded.
 *
 * The verdict comes from the percentage against the paper's pass mark, matching
 * the table exactly — `Result.status` is not used, since it was written by
 * comparing raw marks to a hardcoded 50.
 */
function moduleStatus(
  result: Result | undefined,
  assigned: boolean,
  verdict: 'PASSED' | 'FAILED' | null,
): string {
  if (!assigned) return 'Not assigned';
  if (!result) return 'Not attempted';
  return verdict ?? 'Submitted (not graded)';
}

/**
 * Marks as awarded, e.g. "17/20". Kept beside the percentage because the two
 * answer different questions, and a recruiter checking a borderline candidate
 * wants the marks the paper was actually scored out of.
 */
function aptitudeMarksLabel(result: Result | undefined): string | null {
  if (!result) return null;
  const scored = result.score ?? 0;
  return result.totalMarks ? `${scored}/${result.totalMarks}` : `${scored}`;
}

/**
 * Excel refuses a cell over 32,767 characters and fails the whole write, so a
 * runaway submission is truncated rather than costing the recruiter the file.
 * The cut is marked so nobody reads the remainder as the candidate's whole answer.
 */
const MAX_CELL_LENGTH = 32000;

function cellSafeCode(code: string): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_CELL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_CELL_LENGTH)}
… truncated for Excel …`;
}

/** Full name from the application, or nothing when no profile was loaded. */
function candidateName(profile?: ExportCandidateProfile): string | null {
  const name = [profile?.firstName, profile?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || null;
}

/** What one module's attempt says about itself: timings and how it ended. */
interface AttemptFacts {
  submittedAt: Date | null;
  /** Minutes actually spent, when the exam recorded enough to work it out. */
  minutesTaken: number | null;
  /** "Submitted by candidate", "Timed out", "Auto-submitted (proctoring)". */
  submission: string | null;
}

/**
 * How an attempt ended, in the vocabulary a recruiter reviewing the sheet needs.
 *
 * The distinction matters: someone who ran out of time and someone whose exam
 * was ended by the proctor are both "auto" to the system, but only one of them
 * did something wrong. Attempts recorded before the exam started keeping this
 * report nothing rather than claiming a manual submit that was never observed.
 */
function submissionLabel(meta?: SubmissionMeta): string | null {
  if (!meta) return null;
  if (meta.mode === 'MANUAL') return 'Submitted by candidate';
  if (/time/i.test(meta.reason ?? '')) return 'Timed out';
  return meta.reason ? `Auto-submitted (${meta.reason})` : 'Auto-submitted';
}

/**
 * Time spent is derived from what was left on the clock, which is the only
 * figure the exam records. Both halves are needed, so an attempt that stored
 * neither reports no duration instead of a misleading zero.
 */
function minutesTaken(meta?: SubmissionMeta): number | null {
  const { secondsLeft, durationSeconds } = meta ?? {};
  if (!Number.isFinite(secondsLeft) || !Number.isFinite(durationSeconds)) return null;
  if ((durationSeconds as number) <= 0) return null;
  const spent = Math.max(0, (durationSeconds as number) - (secondsLeft as number));
  return Math.round((spent / 60) * 10) / 10;
}

function attemptFacts(result?: Result): AttemptFacts {
  if (!result) return { submittedAt: null, minutesTaken: null, submission: null };
  const { submission } = splitResultsJson<unknown>(result.resultsJson);
  return {
    submittedAt: dateCell(result.submittedAt),
    minutesTaken: minutesTaken(submission),
    submission: submissionLabel(submission),
  };
}

/** Same three words the result screens use for a coding question. */
const CODING_OUTCOME_LABELS: Record<ExportCodingQuestion['outcome'], string> = {
  pass: 'Solved',
  fail: 'Attempted — not solved',
  skip: 'Not attempted',
};

const OVERALL_LABELS: Record<ExportCandidateRow['overallStatus'], string> = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  PARTIAL: 'Pending',
};

export function resultsWorkbookFileName(input: ResultsExportInput): string {
  const { jobPrefix, generatedAt, filters } = input;
  const stamp = generatedAt.toISOString().slice(0, 10);
  const safePrefix = jobPrefix.replace(/[^\w.-]+/g, '-');
  // Marked in the name as well as inside, so the two downloads a recruiter takes
  // in one sitting do not collide and are told apart in the downloads folder.
  const scope = isFiltered(filters) ? '_filtered' : '';
  return `assessment-results_${safePrefix}_${stamp}${scope}.xlsx`;
}

/**
 * ExcelJS ships as CommonJS, so the shape of a dynamic import depends on who is
 * doing the interop: a bundler hands back a namespace carrying the named
 * exports, plain Node hands back one whose `default` holds them. Reading
 * `.Workbook` off the wrong one throws "not a constructor" at the moment the
 * admin clicks download, so take whichever object actually has it.
 */
async function loadExcelJs(): Promise<typeof import('exceljs')> {
  type ExcelJsModule = typeof import('exceljs');
  const imported = (await import('exceljs')) as ExcelJsModule & { default?: ExcelJsModule };
  return imported.Workbook ? imported : (imported.default as ExcelJsModule);
}

export async function buildResultsWorkbook(input: ResultsExportInput): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rightpath';
  workbook.created = input.generatedAt;

  addSummarySheet(workbook, input);
  addFinalSummarySheet(workbook, input);
  addCandidateDetailsSheet(workbook, input);
  addResultsSheet(workbook, input);
  addAptitudeAnswersSheet(workbook, input);
  addCodingByDifficultySheet(workbook, input);
  addSubmissionsSheet(workbook, input);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

type Workbook = import('exceljs').Workbook;
type Worksheet = import('exceljs').Worksheet;

/** Bold reversed header, frozen so it stays put on a long candidate list. */
function styleHeader(sheet: Worksheet, columnCount: number): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  };
}

/** Hairlines only — heavy grids make a long export harder to read, not easier. */
function styleBody(sheet: Worksheet): void {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: BORDER_TINT } },
      };
      cell.alignment = { vertical: 'middle', ...cell.alignment };
    });
  });
}

function addSummarySheet(workbook: Workbook, input: ResultsExportInput): void {
  const { rows, jobTitle, jobPrefix, generatedAt, filters, totalCandidates } = input;
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Field', key: 'field', width: 26 },
    { header: 'Value', key: 'value', width: 46 },
  ];

  const counts = {
    passed: rows.filter((r) => r.overallStatus === 'PASSED').length,
    failed: rows.filter((r) => r.overallStatus === 'FAILED').length,
    pending: rows.filter((r) => r.overallStatus === 'PARTIAL').length,
  };

  // Averaged over candidates with a score — counting an unsat exam as 0 would
  // drag the cohort average down for a paper nobody was marked on.
  const scored = rows.map((r) => r.overallScore).filter((s): s is number => s !== null);
  const average = scored.length
    ? scored.reduce((sum, s) => sum + s, 0) / scored.length
    : null;

  // A filtered export must announce itself. Read months later, "Candidates in
  // report: 4" with no filter line reads as a job that only ever had four people.
  const filtered = isFiltered(filters);

  type SummaryEntry = [string, string | number | Date | null, string?];

  const filterEntries: SummaryEntry[] = filtered
    ? [
        ['Filter — status', filters.status],
        ['Filter — email search', filters.search || '(none)'],
        ['Filter — submitted', filters.dateRange || '(any date)'],
        ...(totalCandidates === undefined
          ? []
          : ([['Candidates on job', totalCandidates]] as SummaryEntry[])),
      ]
    : [];

  const entries: SummaryEntry[] = [
    ['Job title', jobTitle],
    ['Job prefix', jobPrefix],
    ['Report generated', toExcelWallClock(generatedAt), DATE_FORMAT],
    ['Scope', filtered ? 'Filtered subset' : 'All candidates'],
    ...filterEntries,
    ['Candidates in report', rows.length],
    ['Passed', counts.passed],
    ['Failed', counts.failed],
    ['Pending', counts.pending],
    ['Average overall score', percentCell(average), PERCENT_FORMAT],
  ];

  for (const [field, value, numFmt] of entries) {
    const row = sheet.addRow({ field, value });
    row.getCell('field').font = { bold: true };
    if (numFmt) row.getCell('value').numFmt = numFmt;
  }

  styleHeader(sheet, 2);
  styleBody(sheet);
}

/** The three difficulty bands, in the order a paper climbs through them. */
const SUMMARY_BANDS = ['Basic', 'Intermediate', 'Advanced'] as const;

/** A band's tally, or nothing when the paper had no questions at that level. */
function bandTally(
  bands: ExportCodingBand[] | undefined,
  name: string,
): { passed: number | null; total: number | null; rate: number | null } {
  const band = bands?.find((entry) => entry.name === name);
  if (!band || band.testsTotal === 0) return { passed: null, total: null, rate: null };
  return {
    passed: band.testsPassed,
    total: band.testsTotal,
    rate: band.testsPassed / band.testsTotal,
  };
}

/** Every language the candidate wrote in, in the order the paper asked. */
function languagesUsed(questions: ExportCodingQuestion[] | undefined): string | null {
  const seen: string[] = [];
  for (const question of questions ?? []) {
    const language = question.language?.trim();
    if (language && !seen.includes(language)) seen.push(language);
  }
  return seen.length > 0 ? seen.join(', ') : null;
}

/**
 * Coding totals taken off the paper rather than off what was run, so a question
 * the candidate never opened still counts against them.
 */
function codingTally(row: ExportCandidateRow): {
  questions: number | null;
  solved: number | null;
  unsolved: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
} {
  const questions = row.codingQuestions ?? [];
  if (questions.length === 0) {
    return { questions: null, solved: null, unsolved: null, testsPassed: null, testsTotal: null };
  }
  const solved = questions.filter((question) => question.outcome === 'pass').length;
  return {
    questions: questions.length,
    solved,
    unsolved: questions.length - solved,
    testsPassed: questions.reduce((sum, question) => sum + question.testsPassed, 0),
    testsTotal: questions.reduce((sum, question) => sum + question.testsTotal, 0),
  };
}

/**
 * The one-line reading of a candidate, for the column a recruiter scans before
 * deciding anything.
 *
 * Only the things that change what the numbers beside them mean: a re-sit, a
 * paper never sat, an exam that ended itself, a score that could not be derived,
 * and the bands the candidate is weakest in. Silence means the row already says
 * everything there is to say.
 */
function summaryRemarks(row: ExportCandidateRow): string | null {
  const notes: string[] = [];

  const aptitudeAttempts = row.aptitudeAttempts?.length ?? 0;
  const codingAttempts = row.codingAttempts?.length ?? 0;
  if (aptitudeAttempts > 1) notes.push(`Aptitude sat ${aptitudeAttempts} times`);
  if (codingAttempts > 1) notes.push(`Coding sat ${codingAttempts} times`);

  if (!row.aptitudeResult) notes.push('Aptitude not sat');
  if (!row.hasCoding) notes.push('No coding paper assigned');
  else if (!row.codingResult) notes.push('Coding not sat');

  // A percentage that could not be derived is not a zero, and the reader has to
  // be told which of the two they are looking at.
  if (row.aptitudeResult && row.aptitudeScore === null) notes.push('Aptitude score unavailable');
  if (row.codingResult && row.codingScore === null) notes.push('Coding score unavailable');

  for (const attempt of [attemptFacts(row.aptitudeResult), attemptFacts(row.codingResult)]) {
    if (attempt.submission && attempt.submission !== 'Submitted by candidate') {
      notes.push(attempt.submission);
    }
  }

  const weak = (row.codingBands ?? [])
    .filter((band) => band.testsTotal > 0 && band.testsPassed / band.testsTotal < 0.6)
    .map((band) => band.name);
  if (weak.length > 0) notes.push(`Weak: ${weak.join(', ')}`);

  return notes.length > 0 ? notes.join('; ') : null;
}

/**
 * One row per candidate, holding everything a hiring decision is made on.
 *
 * The sheets that follow each go deep on one thing — the answer sheet, the
 * code, the difficulty split. This is the sheet that gets read first and, for
 * most candidates, only: every figure the result screen shows, on one line,
 * sortable and filterable.
 *
 * Second in the book, straight after the run's own details. Kept alongside
 * "Candidate Results" rather than replacing it — that sheet is organised around
 * the timings of each sitting, this one around the outcome.
 */
function addFinalSummarySheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Final Summary');
  const MINUTES = '0.0';

  sheet.columns = [
    { header: 'Assessment Date', key: 'assessmentDate', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Candidate Email', key: 'email', width: 32 },
    { header: 'Overall Score (%)', key: 'overallScore', width: 16, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Overall Result', key: 'overallResult', width: 15 },
    { header: 'Aptitude Score (%)', key: 'aptitudeScore', width: 17, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Aptitude Total Questions', key: 'aptitudeTotal', width: 22 },
    { header: 'Aptitude Correct', key: 'aptitudeCorrect', width: 16 },
    { header: 'Aptitude Incorrect', key: 'aptitudeIncorrect', width: 17 },
    { header: 'Aptitude Answered', key: 'aptitudeAnswered', width: 17 },
    { header: 'Aptitude Skipped', key: 'aptitudeSkipped', width: 16 },
    { header: 'Aptitude Result', key: 'aptitudeResult', width: 16 },
    { header: 'Coding Score (%)', key: 'codingScore', width: 16, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Coding Questions', key: 'codingQuestions', width: 17 },
    { header: 'Coding Solved', key: 'codingSolved', width: 14 },
    { header: 'Coding Unsolved', key: 'codingUnsolved', width: 16 },
    { header: 'Total Test Cases', key: 'testsTotal', width: 16 },
    { header: 'Test Cases Passed', key: 'testsPassed', width: 18 },
    { header: 'Test Cases Failed', key: 'testsFailed', width: 17 },
    { header: 'Coding Result', key: 'codingResult', width: 15 },
    { header: 'Basic Passed', key: 'basicPassed', width: 13 },
    { header: 'Basic Total', key: 'basicTotal', width: 12 },
    { header: 'Basic %', key: 'basicRate', width: 10, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Intermediate Passed', key: 'intermediatePassed', width: 19 },
    { header: 'Intermediate Total', key: 'intermediateTotal', width: 18 },
    { header: 'Intermediate %', key: 'intermediateRate', width: 15, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Advanced Passed', key: 'advancedPassed', width: 16 },
    { header: 'Advanced Total', key: 'advancedTotal', width: 15 },
    { header: 'Advanced %', key: 'advancedRate', width: 12, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Programming Language', key: 'languages', width: 20 },
    { header: 'Aptitude Submission Status', key: 'aptitudeSubmission', width: 26 },
    { header: 'Coding Submission Status', key: 'codingSubmission', width: 26 },
    { header: 'Remarks', key: 'remarks', width: 46 },
    // Appended rather than woven in, so the columns above keep the order they
    // were asked for and this month's sheet lines up against last month's.
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Experience', key: 'experience', width: 18 },
    { header: 'Role', key: 'role', width: 18 },
    { header: 'Aptitude Marks', key: 'aptitudeMarks', width: 15 },
    { header: 'Aptitude Time (min)', key: 'aptitudeMinutes', width: 18, style: { numFmt: MINUTES } },
    { header: 'Coding Time (min)', key: 'codingMinutes', width: 17, style: { numFmt: MINUTES } },
    { header: 'Aptitude Attempts', key: 'aptitudeAttempts', width: 17 },
    { header: 'Coding Attempts', key: 'codingAttempts', width: 16 },
  ];

  for (const row of input.rows) {
    const aptitude = row.aptitudeResult;
    const aptitudeAttempt = attemptFacts(aptitude);
    const codingAttempt = attemptFacts(row.codingResult);
    const coding = codingTally(row);
    const [basic, intermediate, advanced] = SUMMARY_BANDS.map((name) =>
      bandTally(row.codingBands, name),
    );

    const total = row.aptitudeSummary?.total ?? null;
    const answered = row.aptitudeSummary?.answered ?? null;
    const correct = row.aptitudeSummary?.correct ?? null;

    // The day the exam was sat, from the later of the two papers: a coding
    // re-sit nine days after the aptitude dates the row to the sitting being
    // reported, not to the first thing the candidate ever did.
    const sat =
      [aptitudeAttempt.submittedAt, codingAttempt.submittedAt]
        .filter((date): date is Date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    sheet.addRow({
      assessmentDate: sat,
      name: candidateName(row.profile),
      email: row.email,
      overallScore: percentCell(row.overallScore),
      overallResult: OVERALL_LABELS[row.overallStatus],
      aptitudeScore: percentCell(row.aptitudeScore),
      aptitudeTotal: total,
      aptitudeCorrect: correct,
      // Wrong answers only. A blank is not a wrong answer, and a sheet that adds
      // the two together cannot tell a guesser from someone who ran out of time.
      aptitudeIncorrect: answered !== null && correct !== null ? answered - correct : null,
      aptitudeAnswered: answered,
      aptitudeSkipped: total !== null && answered !== null ? total - answered : null,
      aptitudeResult: moduleStatus(aptitude, !!aptitude, row.aptitudeVerdict),
      codingScore: percentCell(row.codingScore),
      codingQuestions: coding.questions,
      codingSolved: coding.solved,
      codingUnsolved: coding.unsolved,
      testsTotal: coding.testsTotal,
      testsPassed: coding.testsPassed,
      testsFailed:
        coding.testsTotal !== null && coding.testsPassed !== null
          ? coding.testsTotal - coding.testsPassed
          : null,
      codingResult: moduleStatus(row.codingResult, row.hasCoding, row.codingVerdict),
      basicPassed: basic.passed,
      basicTotal: basic.total,
      basicRate: basic.rate,
      intermediatePassed: intermediate.passed,
      intermediateTotal: intermediate.total,
      intermediateRate: intermediate.rate,
      advancedPassed: advanced.passed,
      advancedTotal: advanced.total,
      advancedRate: advanced.rate,
      languages: languagesUsed(row.codingQuestions),
      aptitudeSubmission: aptitudeAttempt.submission,
      codingSubmission: codingAttempt.submission,
      remarks: summaryRemarks(row),
      mobile: row.profile?.mobileNumber ?? null,
      experience: row.profile?.experience ?? null,
      role: row.profile?.jobRole ?? null,
      aptitudeMarks: aptitudeMarksLabel(aptitude),
      aptitudeMinutes: aptitudeAttempt.minutesTaken,
      codingMinutes: codingAttempt.minutesTaken,
      aptitudeAttempts: row.aptitudeAttempts?.length || null,
      codingAttempts: row.codingAttempts?.length || null,
    });
  }

  if (sheet.rowCount === 1) {
    sheet.addRow({ email: 'No candidates matched this export.' });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

function addResultsSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Candidate Results');
  const MINUTES = '0.0';
  sheet.columns = [
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Candidate Email', key: 'email', width: 32 },
    { header: 'Aptitude Score', key: 'aptitudeScore', width: 15, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Aptitude Marks', key: 'aptitudeMarks', width: 15 },
    { header: 'Aptitude Questions', key: 'aptitudeQuestions', width: 18 },
    { header: 'Aptitude Answered', key: 'aptitudeAnswered', width: 18 },
    { header: 'Aptitude Correct', key: 'aptitudeCorrect', width: 17 },
    { header: 'Aptitude Status', key: 'aptitudeStatus', width: 16 },
    { header: 'Aptitude Start', key: 'aptitudeStart', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Aptitude Submitted', key: 'aptitudeSubmitted', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Aptitude Time (min)', key: 'aptitudeMinutes', width: 18, style: { numFmt: MINUTES } },
    { header: 'Aptitude Submission', key: 'aptitudeSubmission', width: 26 },
    { header: 'Aptitude Attempts', key: 'aptitudeAttempts', width: 17 },
    { header: 'Coding Score', key: 'codingScore', width: 14, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Coding Status', key: 'codingStatus', width: 16 },
    { header: 'Coding Start', key: 'codingStart', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Coding Submitted', key: 'codingSubmitted', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Coding Time (min)', key: 'codingMinutes', width: 17, style: { numFmt: MINUTES } },
    { header: 'Coding Submission', key: 'codingSubmission', width: 26 },
    { header: 'Coding Attempts', key: 'codingAttempts', width: 16 },
    { header: 'Test Cases Passed', key: 'testsPassed', width: 18 },
    { header: 'Test Cases Total', key: 'testsTotal', width: 17 },
    { header: 'Overall Score', key: 'overallScore', width: 14, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Overall Status', key: 'overallStatus', width: 15 },
  ];

  for (const row of input.rows) {
    const tests = testCaseTally(row);
    const aptitude = row.aptitudeResult;
    const aptitudeAttempt = attemptFacts(aptitude);
    const codingAttempt = attemptFacts(row.codingResult);

    sheet.addRow({
      name: candidateName(row.profile),
      email: row.email,
      aptitudeScore: percentCell(row.aptitudeScore),
      aptitudeMarks: aptitudeMarksLabel(aptitude),
      aptitudeQuestions: row.aptitudeSummary?.total ?? null,
      aptitudeAnswered: row.aptitudeSummary?.answered ?? null,
      aptitudeCorrect: row.aptitudeSummary?.correct ?? null,
      aptitudeStatus: moduleStatus(aptitude, !!aptitude, row.aptitudeVerdict),
      aptitudeStart: dateCell(row.aptitudeStart),
      aptitudeSubmitted: aptitudeAttempt.submittedAt,
      aptitudeMinutes: aptitudeAttempt.minutesTaken,
      aptitudeSubmission: aptitudeAttempt.submission,
      // How many times the paper was sat. The figures on this row describe the
      // latest; anything above 1 tells the reader an earlier one exists.
      aptitudeAttempts: row.aptitudeAttempts?.length || null,
      codingScore: percentCell(row.codingScore),
      codingStatus: moduleStatus(row.codingResult, row.hasCoding, row.codingVerdict),
      codingStart: row.hasCoding ? dateCell(row.codingStart) : null,
      codingSubmitted: codingAttempt.submittedAt,
      codingMinutes: codingAttempt.minutesTaken,
      codingSubmission: codingAttempt.submission,
      codingAttempts: row.codingAttempts?.length || null,
      testsPassed: tests.total ? tests.passed : null,
      testsTotal: tests.total || null,
      overallScore: percentCell(row.overallScore),
      overallStatus: OVERALL_LABELS[row.overallStatus],
    });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

/**
 * Who the candidates are, kept apart from how they scored.
 *
 * The results sheet is already wide, and contact details are read for a
 * different reason than marks — usually to get hold of someone rather than to
 * compare them. Referral columns are always present but empty for direct
 * applicants, so the sheet's shape does not change job to job.
 */
function addCandidateDetailsSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Candidate Details');
  sheet.columns = [
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Experience', key: 'experience', width: 14 },
    { header: 'Role Applied For', key: 'role', width: 24 },
    { header: 'Source', key: 'source', width: 12 },
    { header: 'Referral ID', key: 'referralId', width: 16 },
    { header: 'Referral Name', key: 'referralName', width: 22 },
    { header: 'Referral Status', key: 'referralStatus', width: 16 },
  ];

  for (const row of input.rows) {
    const profile = row.profile;
    const referralId = profile?.referralId?.trim() || null;
    const referralName = profile?.referralName?.trim() || null;
    const referred = !!(referralId ?? referralName);

    sheet.addRow({
      name: candidateName(profile),
      email: row.email,
      mobile: profile?.mobileNumber || null,
      experience: profile?.experience || null,
      role: profile?.jobRole || null,
      // Mirrors the Candidates table, where a candidate with no referral on
      // file reads as "Direct" rather than as missing data.
      source: profile ? (referred ? 'Referral' : 'Direct') : null,
      referralId,
      referralName,
      referralStatus: referred ? profile?.referralStatus || 'PENDING' : null,
    });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

/**
 * Coding performance split by the paper's difficulty bands.
 *
 * Its own sheet rather than more columns: the bands are whatever the question
 * paper labelled its questions, so the set is not fixed — a paper using
 * "General", or only Basic and Advanced, would leave fixed columns empty or
 * drop data. One row per candidate per band also pivots, which is how anyone
 * actually asks "who is failing the advanced questions".
 */
/**
 * The aptitude answer sheet: every question, what the candidate picked, and
 * what was right.
 *
 * Sits beside the aptitude columns on the results sheet the way the coding code
 * sits beside its submissions — the score says how someone did, this says where
 * they lost it, which is what gets opened when a decision is borderline or
 * challenged.
 *
 * "Answer" distinguishes a blank from a wrong choice: an unanswered question is
 * left empty and marked Not answered, never scored as an incorrect pick.
 */
function addAptitudeAnswersSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Aptitude Answers');
  sheet.columns = [
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Candidate Email', key: 'email', width: 32 },
    { header: 'Q#', key: 'number', width: 6 },
    { header: 'Question', key: 'question', width: 60 },
    { header: 'Difficulty', key: 'difficulty', width: 16 },
    { header: 'Answer Given', key: 'given', width: 14 },
    { header: 'Correct Answer', key: 'correct', width: 16 },
    { header: 'Outcome', key: 'outcome', width: 16 },
    { header: 'Marks Awarded', key: 'marks', width: 15 },
  ];

  for (const row of input.rows) {
    for (const answer of row.aptitudeAnswerSheet ?? []) {
      let outcome = 'Not answered';
      if (answer.isCorrect) outcome = 'Correct';
      else if (answer.answered) outcome = 'Incorrect';

      sheet.addRow({
        name: candidateName(row.profile),
        email: row.email,
        number: answer.number,
        question: answer.question,
        difficulty: answer.difficulty,
        given: answer.selectedAnswer || null,
        correct: answer.correctAnswer || null,
        outcome,
        marks: answer.marks,
      });
    }
  }

  if (sheet.rowCount === 1) {
    sheet.addRow({ name: 'No aptitude answers recorded for this job.' });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

function addCodingByDifficultySheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Coding by Difficulty');
  sheet.columns = [
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Candidate Email', key: 'email', width: 32 },
    { header: 'Difficulty', key: 'band', width: 16 },
    { header: 'Questions', key: 'questions', width: 12 },
    { header: 'Solved', key: 'solved', width: 10 },
    { header: 'Attempted', key: 'attempted', width: 12 },
    { header: 'Test Cases Passed', key: 'testsPassed', width: 18 },
    { header: 'Test Cases Total', key: 'testsTotal', width: 17 },
    { header: 'Pass Rate', key: 'passRate', width: 12, style: { numFmt: PERCENT_FORMAT } },
  ];

  for (const row of input.rows) {
    for (const band of row.codingBands ?? []) {
      sheet.addRow({
        name: candidateName(row.profile),
        email: row.email,
        band: band.name,
        questions: band.questions,
        solved: band.solved,
        attempted: band.attempted,
        testsPassed: band.testsPassed,
        testsTotal: band.testsTotal,
        // A band with no test cases has no rate — 0% would read as "failed
        // everything" when nothing was there to pass.
        passRate: band.testsTotal > 0 ? band.testsPassed / band.testsTotal : null,
      });
    }
  }

  if (sheet.rowCount === 1) {
    sheet.addRow({ name: 'No coding paper available to group by difficulty.' });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

/**
 * One row per coding question, with the run that was made against it.
 *
 * Driven by the question paper rather than by the raw submissions, so a
 * question the candidate never opened still appears as "Not attempted" instead
 * of silently vanishing from their sheet — skipping a question must not make it
 * disappear from the record.
 *
 * Per-question pass rates live here; the per-difficulty totals and their
 * percentages are on the Coding by Difficulty sheet.
 */
function addSubmissionsSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Coding Submissions');
  sheet.columns = [
    { header: 'Candidate Name', key: 'name', width: 24 },
    { header: 'Candidate Email', key: 'email', width: 32 },
    { header: 'Question', key: 'question', width: 30 },
    { header: 'Difficulty', key: 'difficulty', width: 16 },
    { header: 'Language', key: 'language', width: 12 },
    { header: 'Outcome', key: 'outcome', width: 16 },
    { header: 'Test Cases Passed', key: 'testsPassed', width: 18 },
    { header: 'Test Cases Total', key: 'testsTotal', width: 17 },
    { header: 'Pass Rate', key: 'passRate', width: 12, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Last Run', key: 'submitted', width: 20, style: { numFmt: DATE_FORMAT } },
    { header: 'Submitted Code', key: 'code', width: 60 },
  ];

  for (const row of input.rows) {
    for (const question of row.codingQuestions ?? []) {
      sheet.addRow({
        name: candidateName(row.profile),
        email: row.email,
        question: question.title,
        difficulty: question.difficulty,
        language: question.language ?? null,
        outcome: CODING_OUTCOME_LABELS[question.outcome],
        testsPassed: question.testsTotal ? question.testsPassed : null,
        testsTotal: question.testsTotal || null,
        // Blank, not 0%, when the question carried no test cases — there was
        // nothing to pass, which is different from passing none of them.
        passRate: question.testsTotal > 0 ? question.testsPassed / question.testsTotal : null,
        submitted: dateCell(question.submittedAt),
        code: cellSafeCode(question.code),
      });
    }
  }

  if (sheet.rowCount === 1) {
    sheet.addRow({ name: 'No coding questions recorded for this job.' });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}
