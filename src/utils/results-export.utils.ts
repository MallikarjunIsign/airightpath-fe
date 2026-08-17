import type { Result } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

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

function submittedAt(row: ExportCandidateRow): Date | null {
  return (
    dateCell(row.aptitudeResult?.submittedAt) ??
    dateCell(row.codingResult?.submittedAt) ??
    dateCell(row.aptitudeResult?.createdAt)
  );
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
  addResultsSheet(workbook, input);
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

function addResultsSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Candidate Results');
  sheet.columns = [
    { header: 'Candidate Email', key: 'email', width: 34 },
    { header: 'Aptitude Score', key: 'aptitudeScore', width: 15, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Aptitude Marks', key: 'aptitudeMarks', width: 15 },
    { header: 'Aptitude Status', key: 'aptitudeStatus', width: 16 },
    { header: 'Coding Score', key: 'codingScore', width: 14, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Coding Status', key: 'codingStatus', width: 16 },
    { header: 'Test Cases Passed', key: 'testsPassed', width: 18 },
    { header: 'Test Cases Total', key: 'testsTotal', width: 17 },
    { header: 'Overall Score', key: 'overallScore', width: 14, style: { numFmt: PERCENT_FORMAT } },
    { header: 'Overall Status', key: 'overallStatus', width: 15 },
    { header: 'Submitted', key: 'submitted', width: 20, style: { numFmt: DATE_FORMAT } },
  ];

  for (const row of input.rows) {
    const tests = testCaseTally(row);
    const aptitude = row.aptitudeResult;

    sheet.addRow({
      email: row.email,
      aptitudeScore: percentCell(row.aptitudeScore),
      aptitudeMarks: aptitudeMarksLabel(aptitude),
      aptitudeStatus: moduleStatus(aptitude, !!aptitude, row.aptitudeVerdict),
      codingScore: percentCell(row.codingScore),
      codingStatus: moduleStatus(row.codingResult, row.hasCoding, row.codingVerdict),
      testsPassed: tests.total ? tests.passed : null,
      testsTotal: tests.total || null,
      overallScore: percentCell(row.overallScore),
      overallStatus: OVERALL_LABELS[row.overallStatus],
      submitted: submittedAt(row),
    });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}

/**
 * One row per graded code run, so a reviewer can see the attempts behind a
 * coding score without opening each candidate in turn.
 */
function addSubmissionsSheet(workbook: Workbook, input: ResultsExportInput): void {
  const sheet = workbook.addWorksheet('Coding Submissions');
  sheet.columns = [
    { header: 'Candidate Email', key: 'email', width: 34 },
    { header: 'Question ID', key: 'questionId', width: 14 },
    { header: 'Language', key: 'language', width: 12 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Tests Passed', key: 'testsPassed', width: 14 },
    { header: 'Tests Total', key: 'testsTotal', width: 13 },
    { header: 'Submitted', key: 'submitted', width: 20, style: { numFmt: DATE_FORMAT } },
  ];

  for (const row of input.rows) {
    for (const submission of row.codeSubmissions) {
      const tests = submission.testResults ?? [];
      sheet.addRow({
        email: row.email,
        questionId: submission.questionId ?? null,
        language: submission.language ?? null,
        status: submission.status ?? null,
        testsPassed: tests.length ? tests.filter((t) => t.passed).length : null,
        testsTotal: tests.length || null,
        submitted: dateCell(submission.createdAt),
      });
    }
  }

  if (sheet.rowCount === 1) {
    sheet.addRow({ email: 'No code submissions recorded for this job.' });
  }

  styleHeader(sheet, sheet.columns.length);
  styleBody(sheet);
}
