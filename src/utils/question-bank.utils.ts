import { brandWorkbook, loadExcelJs, styleHeader } from '@/utils/results-export.utils';
import { parseQuestionPaper, withExtension } from '@/utils/question-paper.utils';

/**
 * The question bank: every question from every generated paper, as one list.
 *
 * <p>Questions are not stored on their own — each is a line inside the paper attached
 * to an assessment, and the same paper sits on one assessment per candidate. This turns
 * the distinct papers the server returns into individual questions, so they can be
 * searched, filtered and exported, and folds the same question appearing in several
 * papers into one row that says how many papers it was in.</p>
 */

export type BankType = 'APTITUDE' | 'CODING';

/** One paper as the server sends it. */
export interface BankPaper {
  paperId: number;
  jobPrefix: string;
  jobTitle: string;
  assessmentType: BankType;
  assignedTo: number;
  firstAssignedAt?: string;
  lastAssignedAt?: string;
  generatedBy?: string;
  questionPaper: string;
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
  /** Stable within one load: paper and position. */
  id: string;
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
  generatedBy: string;
  /** When the paper it came from was last handed to a candidate. */
  lastAssignedAt?: string;
  /** Candidates who were given the paper this came from, summed across the papers it appeared in. */
  assignedTo: number;
  /** How many distinct papers carried this exact question. */
  papers: number;
}

export interface BankLoad {
  questions: BankQuestion[];
  /** Papers whose contents could not be read as questions, so the page can say so. */
  unreadablePapers: number;
  totalPapers: number;
}

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Every paper → every question, de-duplicated within the same job and type. */
export function buildBank(papers: BankPaper[]): BankLoad {
  const byKey = new Map<string, BankQuestion>();
  let unreadable = 0;

  for (const paper of papers) {
    const parsed = parseQuestionPaper(paper.questionPaper ?? '');
    if (parsed.kind === 'raw') {
      unreadable += 1;
      continue;
    }

    const base = {
      jobPrefix: paper.jobPrefix,
      jobTitle: paper.jobTitle,
      generatedBy: paper.generatedBy ?? '',
      lastAssignedAt: paper.lastAssignedAt,
      assignedTo: paper.assignedTo,
      papers: 1,
    };

    const add = (question: BankQuestion) => {
      // Same job, same kind, same wording: one question, however many papers reused it.
      const key = `${question.jobPrefix}|${question.type}|${normalise(question.text + ' ' + question.description)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, question);
        return;
      }
      existing.papers += 1;
      existing.assignedTo += question.assignedTo;
      if ((question.lastAssignedAt ?? '') > (existing.lastAssignedAt ?? '')) {
        existing.lastAssignedAt = question.lastAssignedAt;
      }
    };

    if (parsed.kind === 'aptitude') {
      parsed.items.forEach((item, index) =>
        add({
          ...base,
          id: `${paper.paperId}-${index}`,
          type: 'APTITUDE',
          text: item.question,
          description: '',
          options: item.options,
          correctAnswer: item.correctAnswer ?? '',
          explanation: item.explanation ?? '',
          difficulty: item.difficulty ?? '',
          marks: item.marks,
          sampleInput: '',
          sampleOutput: '',
          constraints: '',
          solution: '',
          testCases: [],
        }),
      );
    } else {
      parsed.items.forEach((item, index) =>
        add({
          ...base,
          id: `${paper.paperId}-${index}`,
          type: 'CODING',
          text: item.title,
          description: item.description,
          options: [],
          correctAnswer: '',
          explanation: '',
          difficulty: item.difficulty ?? '',
          marks: item.marks,
          sampleInput: item.sampleInput ?? '',
          sampleOutput: item.sampleOutput ?? '',
          constraints: item.constraints ?? '',
          solution: item.solution ?? '',
          testCases: item.testCases,
        }),
      );
    }
  }

  const questions = [...byKey.values()].sort(
    (a, b) => (b.lastAssignedAt ?? '').localeCompare(a.lastAssignedAt ?? '') || a.jobPrefix.localeCompare(b.jobPrefix),
  );
  return { questions, unreadablePapers: unreadable, totalPapers: papers.length };
}

export interface BankFilters {
  type: 'ALL' | BankType;
  jobPrefix: string;
  difficulty: string;
  generatedBy: string;
  /** yyyy-mm-dd, inclusive; compared against when the paper was last assigned. */
  from: string;
  to: string;
  search: string;
}

export const EMPTY_FILTERS: BankFilters = {
  type: 'ALL',
  jobPrefix: '',
  difficulty: '',
  generatedBy: '',
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
    const day = (q.lastAssignedAt ?? '').slice(0, 10);
    if (filters.from && (!day || day < filters.from)) return false;
    if (filters.to && (!day || day > filters.to)) return false;
    if (needle) {
      const haystack = [
        q.text,
        q.description,
        q.jobPrefix,
        q.jobTitle,
        q.difficulty,
        ...q.options.map((o) => o.text),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** The distinct values a filter dropdown should offer, from the questions as loaded. */
export function distinct(questions: BankQuestion[], pick: (q: BankQuestion) => string): string[] {
  return [...new Set(questions.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ── Exports ───────────────────────────────────────────────────────────────

export interface ExportContext {
  filters: BankFilters;
  /** Total before filtering, so a partial export is never mistaken for the whole bank. */
  totalInBank: number;
  generatedAt: Date;
}

const stamp = (date: Date) => date.toISOString().slice(0, 10);

/** What the file says about how it was made, in words. */
export function describeFilters(filters: BankFilters): string {
  const parts: string[] = [];
  if (filters.type !== 'ALL') parts.push(filters.type === 'APTITUDE' ? 'Aptitude' : 'Coding');
  if (filters.jobPrefix) parts.push(`job ${filters.jobPrefix}`);
  if (filters.difficulty) parts.push(`difficulty ${filters.difficulty}`);
  if (filters.generatedBy) parts.push(`generated by ${filters.generatedBy}`);
  if (filters.from) parts.push(`from ${filters.from}`);
  if (filters.to) parts.push(`until ${filters.to}`);
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
    // The id only keys a row on screen; it means nothing outside this page.
    questions: questions.map(({ id: _rowKey, ...rest }) => rest),
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
  { header: 'Generated by', width: 28 },
  { header: 'Last assigned', width: 18 },
  { header: 'In papers', width: 10 },
  { header: 'Candidates given it', width: 18 },
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
  { header: 'Generated by', width: 28 },
  { header: 'Last assigned', width: 18 },
  { header: 'In papers', width: 10 },
  { header: 'Candidates given it', width: 18 },
];

const asDate = (value?: string): Date | string => {
  if (!value) return '';
  const date = new Date(value.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date;
};

/** A workbook with a sheet per kind. Numbers and dates are real cells, so they sort and filter. */
export async function buildBankWorkbook(questions: BankQuestion[], context: ExportContext): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rightpath';
  workbook.created = context.generatedAt;

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 26 }, { width: 70 }];
  summary.addRows([
    ['Question bank', ''],
    ['Exported', context.generatedAt],
    ['Filter', describeFilters(context.filters)],
    ['Questions in this file', questions.length],
    ['Questions in the bank', context.totalInBank],
    ['Aptitude', questions.filter((q) => q.type === 'APTITUDE').length],
    ['Coding', questions.filter((q) => q.type === 'CODING').length],
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
        q.jobPrefix,
        q.jobTitle,
        q.text,
        option('A'),
        option('B'),
        option('C'),
        option('D'),
        q.correctAnswer,
        q.explanation,
        q.difficulty,
        q.marks ?? '',
        q.generatedBy,
        asDate(q.lastAssignedAt),
        q.papers,
        q.assignedTo,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(13).numFmt = 'yyyy-mm-dd hh:mm';
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
        q.jobPrefix,
        q.jobTitle,
        q.text,
        q.description,
        q.sampleInput,
        q.sampleOutput,
        q.constraints,
        q.testCases.length,
        q.testCases.filter((tc) => tc.isHidden).length,
        q.solution,
        q.difficulty,
        q.marks ?? '',
        q.generatedBy,
        asDate(q.lastAssignedAt),
        q.papers,
        q.assignedTo,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(14).numFmt = 'yyyy-mm-dd hh:mm';
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CODING_COLUMNS.length } };
  }

  brandWorkbook(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * One PDF with every question in the filtered list, laid out as text so it stays
 * selectable. Loaded on demand: the PDF library is dead weight on every other screen.
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

  // Page numbers last, once the page count is known.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
  }
  return doc.output('blob');
}
