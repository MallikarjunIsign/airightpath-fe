import { brandWorkbook, loadExcelJs, styleHeader } from '@/utils/results-export.utils';
import { parseQuestionPaper, withExtension } from '@/utils/question-paper.utils';

/**
 * The question bank as the screens use it.
 *
 * <p>The server keeps every question on its own — whether it came out of the AI generator, an
 * uploaded file or a paper already handed to candidates — with how often it has been given and to
 * how many different people. This turns those rows into what the page lists, filters and exports,
 * and builds a question paper back out of a hand-picked selection.</p>
 */

export type BankType = 'APTITUDE' | 'CODING';
export type BankSource = 'AI_GENERATED' | 'UPLOADED';

/** One question as the server sends it. */
export interface BankItem {
  id: number;
  jobPrefix: string;
  jobTitle: string;
  assessmentType: BankType;
  /** The question as one JSON object, in the shape the generator produced. */
  content: string;
  difficulty?: string;
  marks?: number;
  source: BankSource;
  createdBy?: string;
  createdAt: string;
  timesAssigned: number;
  uniqueCandidates: number;
  lastAssignedAt?: string;
}

/** One time a question was given to a candidate. */
export interface BankAssignment {
  assessmentId: number;
  candidateEmail: string;
  jobPrefix: string;
  assignedAt?: string;
}

export interface BankSyncStatus {
  running: boolean;
  processed: number;
  total: number;
  newQuestions: number;
  newAssignments: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export interface BankOption {
  key: string;
  text: string;
}

export interface BankTestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface BankQuestion {
  /** The server's id for the question. */
  id: number;
  type: BankType;
  jobPrefix: string;
  jobTitle: string;
  /** What the question says: the aptitude question, or the coding problem's title. */
  text: string;
  /** The coding problem statement. Empty for aptitude. */
  description: string;
  options: BankOption[];
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  marks?: number;
  sampleInput: string;
  sampleOutput: string;
  constraints: string;
  solution: string;
  testCases: BankTestCase[];
  source: BankSource;
  /** Who generated or first uploaded it. */
  generatedBy: string;
  createdAt: string;
  timesAssigned: number;
  uniqueCandidates: number;
  lastAssignedAt?: string;
  /** The original JSON, kept so a selection can be turned back into a paper unchanged. */
  raw: string;
}

export interface BankLoad {
  questions: BankQuestion[];
  /** Rows whose content could not be read as a question. */
  unreadable: number;
}

/** Server rows → what the page shows. */
export function buildBank(items: BankItem[]): BankLoad {
  const questions: BankQuestion[] = [];
  let unreadable = 0;

  for (const item of items) {
    const parsed = parseQuestionPaper(`[${item.content}]`);
    if (parsed.kind === 'raw') {
      unreadable += 1;
      continue;
    }
    const base = {
      id: item.id,
      type: item.assessmentType,
      jobPrefix: item.jobPrefix,
      jobTitle: item.jobTitle,
      source: item.source,
      generatedBy: item.createdBy ?? '',
      createdAt: item.createdAt,
      timesAssigned: item.timesAssigned,
      uniqueCandidates: item.uniqueCandidates,
      lastAssignedAt: item.lastAssignedAt,
      raw: item.content,
    };

    if (parsed.kind === 'aptitude') {
      const q = parsed.items[0];
      questions.push({
        ...base,
        text: q.question,
        description: '',
        options: q.options,
        correctAnswer: q.correctAnswer ?? '',
        explanation: q.explanation ?? '',
        difficulty: q.difficulty ?? item.difficulty ?? '',
        marks: q.marks ?? item.marks,
        sampleInput: '',
        sampleOutput: '',
        constraints: '',
        solution: '',
        testCases: [],
      });
    } else {
      const q = parsed.items[0];
      questions.push({
        ...base,
        text: q.title,
        description: q.description,
        options: [],
        correctAnswer: '',
        explanation: '',
        difficulty: q.difficulty ?? item.difficulty ?? '',
        marks: q.marks ?? item.marks,
        sampleInput: q.sampleInput ?? '',
        sampleOutput: q.sampleOutput ?? '',
        constraints: q.constraints ?? '',
        solution: q.solution ?? '',
        testCases: q.testCases,
      });
    }
  }
  return { questions, unreadable };
}

export type UsageFilter = 'ALL' | 'UNUSED' | 'ASSIGNED';

export interface BankFilters {
  type: 'ALL' | BankType;
  jobPrefix: string;
  difficulty: string;
  generatedBy: string;
  /** Never given to anyone, or given at least once. */
  usage: UsageFilter;
  source: 'ALL' | BankSource;
  /** yyyy-mm-dd, inclusive; compared against when it was last assigned. */
  from: string;
  to: string;
  search: string;
}

export const EMPTY_FILTERS: BankFilters = {
  type: 'ALL',
  jobPrefix: '',
  difficulty: '',
  generatedBy: '',
  usage: 'ALL',
  source: 'ALL',
  from: '',
  to: '',
  search: '',
};

export function filtersActive(filters: BankFilters): boolean {
  return (Object.keys(EMPTY_FILTERS) as (keyof BankFilters)[]).some((key) => filters[key] !== EMPTY_FILTERS[key]);
}

export function applyFilters(questions: BankQuestion[], filters: BankFilters): BankQuestion[] {
  const needle = filters.search.trim().toLowerCase();
  return questions.filter((q) => {
    if (filters.type !== 'ALL' && q.type !== filters.type) return false;
    if (filters.jobPrefix && q.jobPrefix !== filters.jobPrefix) return false;
    if (filters.difficulty && q.difficulty.toLowerCase() !== filters.difficulty.toLowerCase()) return false;
    if (filters.generatedBy && q.generatedBy !== filters.generatedBy) return false;
    if (filters.usage === 'UNUSED' && q.timesAssigned > 0) return false;
    if (filters.usage === 'ASSIGNED' && q.timesAssigned === 0) return false;
    if (filters.source !== 'ALL' && q.source !== filters.source) return false;
    const day = (q.lastAssignedAt ?? '').slice(0, 10);
    if (filters.from && (!day || day < filters.from)) return false;
    if (filters.to && (!day || day > filters.to)) return false;
    if (needle) {
      const haystack = [q.text, q.description, q.jobPrefix, q.jobTitle, q.difficulty, ...q.options.map((o) => o.text)]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** The distinct values a filter dropdown should offer. */
export function distinct(questions: BankQuestion[], pick: (q: BankQuestion) => string): string[] {
  return [...new Set(questions.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** How the bank stands: what there is, and how much of it has been put to use. */
export interface BankTotals {
  total: number;
  aptitude: number;
  coding: number;
  assigned: number;
  unused: number;
  /** Questions given more than once to the same candidate. */
}

export function totalsOf(questions: BankQuestion[]): BankTotals {
  return {
    total: questions.length,
    aptitude: questions.filter((q) => q.type === 'APTITUDE').length,
    coding: questions.filter((q) => q.type === 'CODING').length,
    assigned: questions.filter((q) => q.timesAssigned > 0).length,
    unused: questions.filter((q) => q.timesAssigned === 0).length,
  };
}

/**
 * Who got a question, and how many times each. A candidate who appears more than once was given it
 * on more than one assessment, which is the repetition worth noticing.
 */
export function repetitionByCandidate(assignments: BankAssignment[]): { email: string; times: number; last?: string }[] {
  const byEmail = new Map<string, { email: string; times: number; last?: string }>();
  for (const a of assignments) {
    const row = byEmail.get(a.candidateEmail) ?? { email: a.candidateEmail, times: 0, last: undefined };
    row.times += 1;
    if ((a.assignedAt ?? '') > (row.last ?? '')) row.last = a.assignedAt;
    byEmail.set(a.candidateEmail, row);
  }
  return [...byEmail.values()].sort((a, b) => b.times - a.times || a.email.localeCompare(b.email));
}

// ── Building a paper from a selection ─────────────────────────────────────

/**
 * A question paper, as a file, from questions picked in order.
 *
 * <p>The questions are written back exactly as they were stored, in the order given, with only the
 * numbering redone — 1 to N — so the exam engine sees an ordinary paper. The server recognises each
 * question by its wording, so handing this to candidates is recorded against the same bank rows.</p>
 */
export function buildPaperFile(selected: BankQuestion[], jobPrefix: string, type: BankType): File {
  const questions = selected.map((q, index) => {
    const original = JSON.parse(q.raw) as Record<string, unknown>;
    return { ...original, id: type === 'CODING' && typeof original.id === 'string' ? String(index + 1) : index + 1 };
  });
  const name = `${jobPrefix}_${type === 'APTITUDE' ? 'aptitude' : 'coding'}_from_bank.json`;
  return new File([JSON.stringify(questions, null, 2)], name, { type: 'application/json' });
}

// ── Exports ───────────────────────────────────────────────────────────────

export interface ExportContext {
  filters: BankFilters;
  /** Total before filtering, so a partial export is never mistaken for the whole bank. */
  totalInBank: number;
  generatedAt: Date;
}

const stamp = (date: Date) => date.toISOString().slice(0, 10);

const USAGE_WORDS: Record<UsageFilter, string> = { ALL: '', UNUSED: 'never assigned', ASSIGNED: 'assigned at least once' };

/** What the file says about how it was made, in words. */
export function describeFilters(filters: BankFilters): string {
  const parts: string[] = [];
  if (filters.type !== 'ALL') parts.push(filters.type === 'APTITUDE' ? 'Aptitude' : 'Coding');
  if (filters.jobPrefix) parts.push(`job ${filters.jobPrefix}`);
  if (filters.difficulty) parts.push(`difficulty ${filters.difficulty}`);
  if (filters.generatedBy) parts.push(`generated by ${filters.generatedBy}`);
  if (filters.usage !== 'ALL') parts.push(USAGE_WORDS[filters.usage]);
  if (filters.source !== 'ALL') parts.push(filters.source === 'AI_GENERATED' ? 'first generated by AI' : 'first uploaded');
  if (filters.from) parts.push(`last assigned from ${filters.from}`);
  if (filters.to) parts.push(`last assigned until ${filters.to}`);
  if (filters.search.trim()) parts.push(`matching "${filters.search.trim()}"`);
  return parts.length ? parts.join(', ') : 'all questions';
}

export function bankFilename(extension: string, context: ExportContext): string {
  return withExtension(`question-bank-${stamp(context.generatedAt)}`, extension);
}

/** JSON as data: nothing flattened or abbreviated, every field a consumer might want. */
export function buildBankJson(questions: BankQuestion[], context: ExportContext): Blob {
  const payload = {
    exportedAt: context.generatedAt.toISOString(),
    filter: describeFilters(context.filters),
    count: questions.length,
    totalInBank: context.totalInBank,
    // `raw` repeats what the other fields already say, and the id is the server's own.
    questions: questions.map((question) =>
      Object.fromEntries(Object.entries(question).filter(([key]) => key !== 'raw')),
    ),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

const APTITUDE_COLUMNS = [
  { header: 'Job prefix', width: 24 },
  { header: 'Job title', width: 26 },
  { header: 'Question', width: 70 },
  { header: 'A', width: 30 },
  { header: 'B', width: 30 },
  { header: 'C', width: 30 },
  { header: 'D', width: 30 },
  { header: 'Correct answer', width: 16 },
  { header: 'Explanation', width: 50 },
  { header: 'Difficulty', width: 12 },
  { header: 'Marks', width: 8 },
  { header: 'Origin', width: 14 },
  { header: 'Generated by', width: 28 },
  { header: 'Times assigned', width: 15 },
  { header: 'Unique candidates', width: 17 },
  { header: 'Last assigned', width: 18 },
];

const CODING_COLUMNS = [
  { header: 'Job prefix', width: 24 },
  { header: 'Job title', width: 26 },
  { header: 'Title', width: 36 },
  { header: 'Problem', width: 70 },
  { header: 'Sample input', width: 28 },
  { header: 'Sample output', width: 28 },
  { header: 'Constraints', width: 30 },
  { header: 'Test cases', width: 10 },
  { header: 'Hidden test cases', width: 16 },
  { header: 'Reference solution', width: 60 },
  { header: 'Difficulty', width: 12 },
  { header: 'Marks', width: 8 },
  { header: 'Origin', width: 14 },
  { header: 'Generated by', width: 28 },
  { header: 'Times assigned', width: 15 },
  { header: 'Unique candidates', width: 17 },
  { header: 'Last assigned', width: 18 },
];

const asDate = (value?: string): Date | string => {
  if (!value) return '';
  const date = new Date(value.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date;
};

const originOf = (q: BankQuestion) => (q.source === 'AI_GENERATED' ? 'AI generated' : 'Uploaded');

/** A workbook with a sheet per kind. Numbers and dates are real cells, so they sort and filter. */
export async function buildBankWorkbook(questions: BankQuestion[], context: ExportContext): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rightpath';
  workbook.created = context.generatedAt;

  const totals = totalsOf(questions);
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 70 }];
  summary.addRows([
    ['Question bank', ''],
    ['Exported', context.generatedAt],
    ['Filter', describeFilters(context.filters)],
    ['Questions in this file', questions.length],
    ['Questions in the bank', context.totalInBank],
    ['Aptitude', totals.aptitude],
    ['Coding', totals.coding],
    ['Assigned at least once', totals.assigned],
    ['Never assigned', totals.unused],
  ]);
  summary.getRow(1).font = { bold: true, size: 14 };

  const aptitude = questions.filter((q) => q.type === 'APTITUDE');
  const coding = questions.filter((q) => q.type === 'CODING');

  if (aptitude.length > 0 || coding.length === 0) {
    const sheet = workbook.addWorksheet('Aptitude');
    sheet.columns = APTITUDE_COLUMNS.map((c) => ({ width: c.width }));
    sheet.addRow(APTITUDE_COLUMNS.map((c) => c.header));
    styleHeader(sheet, APTITUDE_COLUMNS.length);
    aptitude.forEach((q) => {
      const option = (key: string) => q.options.find((o) => o.key.toUpperCase() === key)?.text ?? '';
      const row = sheet.addRow([
        q.jobPrefix, q.jobTitle, q.text, option('A'), option('B'), option('C'), option('D'),
        q.correctAnswer, q.explanation, q.difficulty, q.marks ?? '', originOf(q), q.generatedBy,
        q.timesAssigned, q.uniqueCandidates, asDate(q.lastAssignedAt),
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(16).numFmt = 'yyyy-mm-dd hh:mm';
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: APTITUDE_COLUMNS.length } };
  }

  if (coding.length > 0) {
    const sheet = workbook.addWorksheet('Coding');
    sheet.columns = CODING_COLUMNS.map((c) => ({ width: c.width }));
    sheet.addRow(CODING_COLUMNS.map((c) => c.header));
    styleHeader(sheet, CODING_COLUMNS.length);
    coding.forEach((q) => {
      const row = sheet.addRow([
        q.jobPrefix, q.jobTitle, q.text, q.description, q.sampleInput, q.sampleOutput, q.constraints,
        q.testCases.length, q.testCases.filter((tc) => tc.isHidden).length, q.solution, q.difficulty,
        q.marks ?? '', originOf(q), q.generatedBy, q.timesAssigned, q.uniqueCandidates, asDate(q.lastAssignedAt),
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(17).numFmt = 'yyyy-mm-dd hh:mm';
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CODING_COLUMNS.length } };
  }

  brandWorkbook(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * One PDF with every question in the filtered list, laid out as text so it stays selectable.
 * Loaded on demand: the PDF library is dead weight on every other screen.
 */
export async function buildBankPdf(
  questions: BankQuestion[],
  context: ExportContext,
  options: { includeAnswers: boolean },
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const width = pageWidth - margin * 2;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', indent = 0) => {
    if (!text.trim()) return;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width - indent) as string[];
    const lineHeight = size * 1.35;
    lines.forEach((line) => {
      ensureRoom(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    });
  };

  write('Question bank', 20, 'bold');
  y += 4;
  write(`Exported ${context.generatedAt.toLocaleString()}`, 10, 'italic');
  write(`Filter: ${describeFilters(context.filters)}`, 10, 'italic');
  write(`${questions.length} of ${context.totalInBank} questions`, 10, 'italic');
  y += 10;

  let heading = '';
  questions.forEach((q, index) => {
    const section = `${q.type === 'APTITUDE' ? 'Aptitude' : 'Coding'} — ${q.jobTitle || q.jobPrefix} (${q.jobPrefix})`;
    if (section !== heading) {
      heading = section;
      ensureRoom(40);
      y += 8;
      write(section, 13, 'bold');
      y += 4;
    }

    ensureRoom(60);
    const meta = [q.difficulty, q.marks !== undefined ? `${q.marks} mark${q.marks === 1 ? '' : 's'}` : '']
      .filter(Boolean)
      .join(' · ');
    write(`${index + 1}. ${q.text}${meta ? `   [${meta}]` : ''}`, 11, 'bold');
    write(
      q.timesAssigned === 0
        ? 'Never assigned'
        : `Assigned ${q.timesAssigned} time${q.timesAssigned === 1 ? '' : 's'} to ${q.uniqueCandidates} candidate${q.uniqueCandidates === 1 ? '' : 's'}`,
      8,
      'italic',
      16,
    );

    if (q.type === 'APTITUDE') {
      q.options.forEach((o) => write(`${o.key}. ${o.text}`, 10, 'normal', 16));
      if (options.includeAnswers) {
        if (q.correctAnswer) write(`Answer: ${q.correctAnswer}`, 10, 'bold', 16);
        if (q.explanation) write(`Explanation: ${q.explanation}`, 10, 'italic', 16);
      }
    } else {
      write(q.description, 10, 'normal', 16);
      if (q.sampleInput) write(`Sample input: ${q.sampleInput}`, 10, 'normal', 16);
      if (q.sampleOutput) write(`Sample output: ${q.sampleOutput}`, 10, 'normal', 16);
      if (q.constraints) write(`Constraints: ${q.constraints}`, 10, 'normal', 16);
      if (options.includeAnswers) {
        q.testCases.forEach((tc, i) =>
          write(`Test ${i + 1}${tc.isHidden ? ' (hidden)' : ''}: ${tc.input}  →  ${tc.expectedOutput}`, 9, 'normal', 16),
        );
        if (q.solution) write(`Solution:\n${q.solution}`, 9, 'normal', 16);
      }
    }
    y += 8;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
  }
  return doc.output('blob');
}
