import { brandWorkbook, loadExcelJs, styleHeader } from '@/utils/results-export.utils';
import { describeInterviewSubmission, interviewCompletionLabel } from '@/utils/interview-submission.utils';
import type { InterviewSchedule } from '@/types/interview.types';
import type { VoiceConversationEntryDTO } from '@/services/interview.service';

/**
 * Interview results as a workbook.
 *
 * <p>The interview screens had CSV and nothing else, while the exam side had a
 * branded, typed workbook — so the two halves of the same hiring round
 * exported to different things, and the interview half lost every score to a
 * quoted string. Cells here carry real numbers and real dates for the same
 * reason they do there: a column that merely looks numeric cannot be sorted,
 * filtered or averaged, which is most of why a recruiter wanted Excel.</p>
 *
 * <p>ExcelJS is loaded through the exam side's dynamic import rather than a
 * second static one, so it stays out of the bundle a candidate downloads to
 * sit an interview. The branding and header styling are shared for the same
 * reason — one watermark implementation, not two that drift.</p>
 */
export interface InterviewExportInput {
  jobTitle: string;
  jobPrefix: string;
  /** Already filtered, exactly as the table shows them. */
  rows: InterviewSchedule[];
  /** Total before filtering, so a partial export is never read as the cohort. */
  totalCandidates: number;
  filters: {
    round: string;
    search?: string;
  };
  generatedAt: Date;
  /**
   * The transcript, for a single-candidate export.
   *
   * <p>Only meaningful when exporting one interview: a cohort workbook with
   * every transcript concatenated into one sheet would be unreadable, and the
   * per-candidate export is where anyone actually wants to read what was
   * said.</p>
   */
  transcript?: VoiceConversationEntryDTO[];
}

export async function buildInterviewWorkbook(input: InterviewExportInput): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rightpath';
  workbook.created = input.generatedAt;

  addSummarySheet(workbook, input);
  addResultsSheet(workbook, input);
  if (input.transcript?.length) {
    addTranscriptSheet(workbook, input.transcript);
  }
  brandWorkbook(workbook);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

type Workbook = import('exceljs').Workbook;

/**
 * What was exported, and what was left out.
 *
 * <p>The filter in force is written down. A file that shows twelve candidates
 * when the job had forty, and does not say so, is the one way this export
 * could mislead the person who opens it a month later.</p>
 */
function addSummarySheet(workbook: Workbook, input: InterviewExportInput): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 26 }, { width: 58 }];

  const rows: Array<[string, string | number | Date]> = [
    ['Job', input.jobTitle],
    ['Job prefix', input.jobPrefix],
    ['Round', input.filters.round],
    ['Candidates in this file', input.rows.length],
    ['Candidates on this job', input.totalCandidates],
    ['Generated', input.generatedAt],
  ];
  if (input.filters.search) {
    rows.splice(3, 0, ['Search filter', input.filters.search]);
  }
  if (input.rows.length !== input.totalCandidates) {
    rows.push(['Note', 'This is a filtered view, not every candidate on the job.']);
  }

  rows.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (value instanceof Date) row.getCell(2).numFmt = 'yyyy-mm-dd hh:mm';
  });
}

const RESULT_COLUMNS = [
  { header: 'Email', width: 34 },
  { header: 'Round', width: 18 },
  { header: 'Status', width: 14 },
  { header: 'Result', width: 16 },
  { header: 'Overridden to', width: 15 },
  { header: 'Overridden by', width: 28 },
  { header: 'Score /10', width: 11 },
  { header: 'Recommendation', width: 18 },
  { header: 'Needs review', width: 13 },
  { header: 'How it ended', width: 22 },
  { header: 'Warnings', width: 10 },
  { header: 'Duration (min)', width: 14 },
  { header: 'Started', width: 18 },
  { header: 'Ended', width: 18 },
  { header: 'Deadline', width: 18 },
];

function addResultsSheet(workbook: Workbook, input: InterviewExportInput): void {
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = RESULT_COLUMNS.map((c) => ({ width: c.width }));
  sheet.addRow(RESULT_COLUMNS.map((c) => c.header));

  input.rows.forEach((interview) => {
    const submission = describeInterviewSubmission(interview);
    const minutes = durationMinutes(interview.startedAt, interview.endedAt);

    const row = sheet.addRow([
      interview.email,
      interview.roundLabel ?? interview.round ?? '',
      interview.attemptStatus,
      interview.interviewResult,
      interview.overriddenResult ?? '',
      interview.overriddenBy ?? '',
      // A real number, not a formatted string, so the column averages.
      interview.evaluation?.overallScore ?? null,
      interview.evaluation?.recommendation ?? '',
      interview.needsHumanReview ? 'Yes' : '',
      submission?.label ?? interviewCompletionLabel(interview.completionReason),
      interview.warningCount ?? interview.proctoringWarnings ?? 0,
      minutes ?? null,
      toDate(interview.startedAt),
      toDate(interview.endedAt),
      toDate(interview.deadlineTime),
    ]);

    row.getCell(7).numFmt = '0.0';
    [13, 14, 15].forEach((i) => {
      row.getCell(i).numFmt = 'yyyy-mm-dd hh:mm';
    });
  });

  styleHeader(sheet, RESULT_COLUMNS.length);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: RESULT_COLUMNS.length } };
}

const TRANSCRIPT_COLUMNS = [
  { header: '#', width: 6 },
  { header: 'Speaker', width: 14 },
  { header: 'Topic', width: 22 },
  { header: 'Turn', width: 14 },
  { header: 'Score /10', width: 10 },
  { header: 'What was said', width: 90 },
  { header: 'Code', width: 60 },
  { header: 'Time', width: 18 },
];

/** The conversation, one turn per row, for a single-candidate export. */
function addTranscriptSheet(workbook: Workbook, transcript: VoiceConversationEntryDTO[]): void {
  const sheet = workbook.addWorksheet('Transcript');
  sheet.columns = TRANSCRIPT_COLUMNS.map((c) => ({ width: c.width }));
  sheet.addRow(TRANSCRIPT_COLUMNS.map((c) => c.header));

  transcript.forEach((entry, index) => {
    const row = sheet.addRow([
      index + 1,
      entry.role === 'CANDIDATE' ? 'Candidate' : 'Interviewer',
      entry.topic ?? '',
      entry.turnKind && entry.turnKind !== 'NEW_QUESTION' ? entry.turnKind.replace('_', ' ') : '',
      entry.answerScore ?? null,
      entry.content,
      entry.codeContent ?? '',
      toDate(entry.timestamp),
    ]);
    // Wrapped rather than truncated: an answer is the thing being read here,
    // and a spreadsheet that clips it at the cell edge defeats the export.
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(8).numFmt = 'yyyy-mm-dd hh:mm';
  });

  styleHeader(sheet, TRANSCRIPT_COLUMNS.length);
}

function durationMinutes(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
}

/** A real Date for Excel, or null — never an unparseable string in a date cell. */
function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Filename carrying the job, the filter and the day, so downloads stay apart. */
export function interviewWorkbookFileName(input: InterviewExportInput): string {
  const day = input.generatedAt.toISOString().slice(0, 10);
  const scope = input.rows.length === 1 ? input.rows[0].email.split('@')[0] : input.jobPrefix;
  const round = input.filters.round.toLowerCase().includes('all')
    ? ''
    : `-${input.filters.round.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return `interview-results-${scope}${round}-${day}.xlsx`;
}
