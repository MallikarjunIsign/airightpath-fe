/**
 * Turning a generated question paper (JSON) into something a human can read.
 *
 * The papers are stored and sent as JSON, which is right for the exam engine
 * and useless for a recruiter who wants to check or circulate the paper. These
 * helpers render the same content as a real PDF (jsPDF, loaded on demand), a
 * Word file, or a printable page. Word is HTML under a Word MIME type rather
 * than a real .docx — enough for Word and Google Docs to open and edit, with no
 * extra dependency.
 */

/** A field the renderers don't know by name, kept so nothing is dropped. */
interface ExtraField {
  label: string;
  value: string;
}

interface AptitudeItem {
  question: string;
  options: { key: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
  marks?: number;
  difficulty?: string;
  extras: ExtraField[];
}

interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface CodingItem {
  title: string;
  description: string;
  sampleInput?: string;
  sampleOutput?: string;
  constraints?: string;
  /** Reference solution, when the generator produced one. */
  solution?: string;
  testCases: TestCase[];
  marks?: number;
  difficulty?: string;
  extras: ExtraField[];
}

export type ParsedPaper =
  | { kind: 'aptitude'; items: AptitudeItem[] }
  | { kind: 'coding'; items: CodingItem[] }
  /** Unrecognised shape — shown as formatted JSON so nothing is hidden. */
  | { kind: 'raw'; text: string };

type Json = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Turns a leftover JSON field into a printable "Label: value" pair. */
function toExtraField(key: string, value: unknown): ExtraField | null {
  if (value == null || value === '') return null;
  const label = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
  const text =
    typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return text.trim() ? { label, value: text } : null;
}

/**
 * Everything on the question that the renderers don't handle by name, so a
 * field the generator adds tomorrow still reaches the page.
 */
function collectExtras(item: Json, known: string[]): ExtraField[] {
  const skip = new Set([...known, 'id', 'questionId']);
  return Object.entries(item)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => toExtraField(key, value))
    .filter((f): f is ExtraField => f !== null);
}

/** Test cases carry the expected outputs, i.e. the coding answer key. */
function normaliseTestCases(raw: unknown): TestCase[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc) => {
    const item = (tc ?? {}) as Json;
    return {
      input: str(item.input),
      expectedOutput: str(item.expectedOutput) || str(item.output),
      isHidden: item.isHidden === true || item.hidden === true,
    };
  });
}

/** Options arrive as `{"A":"…"}` or as a plain array. */
function normaliseOptions(raw: unknown): { key: string; text: string }[] {
  if (Array.isArray(raw)) {
    return raw.map((text, i) => ({ key: String.fromCharCode(65 + i), text: str(text) }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Json).map(([key, text]) => ({ key, text: str(text) }));
  }
  return [];
}

/** Coding papers carry a title/description; aptitude ones carry options. */
export function parseQuestionPaper(text: string): ParsedPaper {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'raw', text };
  }

  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Json)?.questions)
      ? ((parsed as Json).questions as unknown[])
      : [];

  if (list.length === 0) {
    return { kind: 'raw', text: JSON.stringify(parsed, null, 2) };
  }

  const first = list[0] as Json;
  const looksCoding =
    'testCases' in first || 'sampleInput' in first || ('title' in first && !('options' in first));

  if (looksCoding) {
    return {
      kind: 'coding',
      items: list.map((q) => {
        const item = q as Json;
        return {
          title: str(item.title) || str(item.question) || 'Untitled problem',
          description: str(item.description) || str(item.question),
          sampleInput: str(item.sampleInput),
          sampleOutput: str(item.sampleOutput),
          constraints: str(item.constraints),
          solution: str(item.solution) || str(item.answer) || str(item.referenceSolution),
          testCases: normaliseTestCases(item.testCases),
          marks: num(item.marks),
          difficulty: str(item.Difficulty) || str(item.difficulty),
          extras: collectExtras(item, [
            'title',
            'question',
            'description',
            'sampleInput',
            'sampleOutput',
            'constraints',
            'solution',
            'answer',
            'referenceSolution',
            'testCases',
            'marks',
            'Difficulty',
            'difficulty',
          ]),
        };
      }),
    };
  }

  return {
    kind: 'aptitude',
    items: list.map((q) => {
      const item = q as Json;
      return {
        question: str(item.questionText) || str(item.question),
        options: normaliseOptions(item.options),
        correctAnswer: str(item.correctAnswer),
        explanation: str(item.explanation) || str(item.rationale),
        marks: num(item.marks),
        difficulty: str(item.Difficulty) || str(item.difficulty) || str(item.category),
        extras: collectExtras(item, [
          'questionText',
          'question',
          'options',
          'correctAnswer',
          'explanation',
          'rationale',
          'marks',
          'Difficulty',
          'difficulty',
          'category',
        ]),
      };
    }),
  };
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function metaLine(difficulty?: string, marks?: number): string {
  const bits: string[] = [];
  if (difficulty) bits.push(escapeHtml(difficulty));
  if (marks !== undefined) bits.push(`${marks} mark${marks === 1 ? '' : 's'}`);
  return bits.length ? `<span class="meta">${bits.join(' · ')}</span>` : '';
}

/** Any field the named renderers didn't cover, so the export is complete. */
function extrasHtml(extras: ExtraField[]): string {
  if (extras.length === 0) return '';
  return extras
    .map(
      (f) =>
        `<p class="extra"><span class="label">${escapeHtml(f.label)}</span>${escapeHtml(f.value)}</p>`,
    )
    .join('');
}

/**
 * A self-contained document. Styles are inline in a `<style>` block so it
 * survives both the print dialog and Word, neither of which sees the app's CSS.
 */
export function questionPaperToHtml(
  title: string,
  paper: ParsedPaper,
  options: { includeAnswers?: boolean } = {},
): string {
  const { includeAnswers = true } = options;
  let body = '';

  if (paper.kind === 'raw') {
    body = `<pre>${escapeHtml(paper.text)}</pre>`;
  } else if (paper.kind === 'aptitude') {
    body = paper.items
      .map((q, i) => {
        const opts = q.options
          .map(
            (o) =>
              `<li${includeAnswers && o.key === q.correctAnswer ? ' class="correct"' : ''}>
                 <strong>${escapeHtml(o.key)}.</strong> ${escapeHtml(o.text)}
               </li>`,
          )
          .join('');
        const answer =
          includeAnswers && q.correctAnswer
            ? `<p class="answer">Answer: ${escapeHtml(q.correctAnswer)}</p>`
            : '';
        const explanation =
          includeAnswers && q.explanation
            ? `<p class="desc"><span class="label">Explanation</span>${escapeHtml(q.explanation)}</p>`
            : '';
        return `<section class="q">
            <h3>Q${i + 1}. ${escapeHtml(q.question)} ${metaLine(q.difficulty, q.marks)}</h3>
            <ol class="options">${opts}</ol>
            ${answer}
            ${explanation}
            ${extrasHtml(q.extras)}
          </section>`;
      })
      .join('');
  } else {
    body = paper.items
      .map((q, i) => {
        const io = [
          q.sampleInput
            ? `<div><p class="label">Sample input</p><pre>${escapeHtml(q.sampleInput)}</pre></div>`
            : '',
          q.sampleOutput
            ? `<div><p class="label">Sample output</p><pre>${escapeHtml(q.sampleOutput)}</pre></div>`
            : '',
        ].join('');
        // Expected outputs are the coding answer key, so the whole table is
        // withheld when the answer key is.
        const cases =
          includeAnswers && q.testCases.length
            ? `<p class="label">Test cases (${q.testCases.length})</p>
               <table class="cases">
                 <tr><th>#</th><th>Input</th><th>Expected output</th><th></th></tr>
                 ${q.testCases
                   .map(
                     (tc, n) => `<tr>
                        <td>${n + 1}</td>
                        <td><pre>${escapeHtml(tc.input)}</pre></td>
                        <td><pre>${escapeHtml(tc.expectedOutput)}</pre></td>
                        <td>${tc.isHidden ? '<span class="meta">hidden</span>' : ''}</td>
                      </tr>`,
                   )
                   .join('')}
               </table>`
            : q.testCases.length
              ? `<p class="meta">${q.testCases.length} test case${q.testCases.length === 1 ? '' : 's'}</p>`
              : '';
        const constraints = q.constraints
          ? `<p class="desc"><span class="label">Constraints</span>${escapeHtml(q.constraints)}</p>`
          : '';
        const solution =
          includeAnswers && q.solution
            ? `<p class="label">Reference solution</p><pre>${escapeHtml(q.solution)}</pre>`
            : '';
        return `<section class="q">
            <h3>Q${i + 1}. ${escapeHtml(q.title)} ${metaLine(q.difficulty, q.marks)}</h3>
            ${q.description ? `<p class="desc">${escapeHtml(q.description)}</p>` : ''}
            ${constraints}
            ${io}
            ${cases}
            ${solution}
            ${extrasHtml(q.extras)}
          </section>`;
      })
      .join('');
  }

  const count = paper.kind === 'raw' ? 0 : paper.items.length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #111; margin: 32px; line-height: 1.5; }
  h1 { font-size: 20pt; margin: 0 0 4px; }
  .sub { color: #555; font-size: 10pt; margin: 0 0 20px; }
  .q { margin: 0 0 18px; padding: 0 0 14px; border-bottom: 1px solid #ddd; page-break-inside: avoid; }
  h3 { font-size: 12pt; margin: 0 0 8px; font-weight: 600; }
  .meta { font-size: 9pt; color: #666; font-weight: normal; }
  .options { margin: 6px 0 6px 18px; padding: 0; }
  .options li { margin: 2px 0; list-style: none; }
  .options li.correct { font-weight: 700; }
  .answer { font-size: 10pt; color: #147a3d; margin: 6px 0 0; }
  .desc { margin: 4px 0 8px; white-space: pre-wrap; }
  .label { font-size: 9pt; color: #666; margin: 8px 0 2px; text-transform: uppercase; letter-spacing: .04em; }
  pre { background: #f5f5f5; padding: 8px 10px; border-radius: 4px; font-family: Consolas, monospace;
        font-size: 10pt; white-space: pre-wrap; margin: 0; }
  .extra { margin: 6px 0 0; font-size: 10pt; white-space: pre-wrap; }
  .extra .label, .desc .label { display: block; }
  table.cases { border-collapse: collapse; width: 100%; margin: 4px 0 8px; font-size: 9pt; }
  table.cases th { text-align: left; background: #f0f0f0; padding: 4px 8px; border: 1px solid #ddd;
                   font-weight: 600; }
  table.cases td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; }
  table.cases pre { background: none; padding: 0; font-size: 9pt; }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${count ? `${count} question${count === 1 ? '' : 's'}` : 'Question paper'}</p>
  ${body}
</body></html>`;
}

/**
 * A real .pdf, laid out as text rather than a screenshot, so it stays
 * selectable and searchable and weighs a few KB.
 */
export async function buildPaperPdf(
  title: string,
  paper: ParsedPaper,
  options: { includeAnswers?: boolean } = {},
) {
  const { includeAnswers = true } = options;
  // Loaded on demand — the PDF library is dead weight on every other screen.
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const width = pageWidth - margin * 2;
  let y = margin;

  /** Starts a new page when the next block would run past the bottom. */
  const ensureRoom = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const write = (
    text: string,
    { size = 11, style = 'normal' as 'normal' | 'bold' | 'italic', gap = 4, indent = 0 } = {},
  ) => {
    if (!text) return;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width - indent) as string[];
    const lineHeight = size * 1.35;
    for (const line of lines) {
      ensureRoom(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  };

  /** A grey caption with its value underneath. */
  const writeLabelled = (label: string, value: string) => {
    doc.setTextColor(110);
    write(label, { size: 8, gap: 1 });
    doc.setTextColor(17);
    write(value, { size: 9, gap: 4, indent: 12 });
  };

  /** Fields the named layout didn't cover — printed so nothing is lost. */
  const writeExtras = (extras: { label: string; value: string }[]) => {
    extras.forEach((f) => writeLabelled(f.label, f.value));
  };

  write(title, { size: 16, style: 'bold', gap: 2 });
  const count = paper.kind === 'raw' ? 0 : paper.items.length;
  doc.setTextColor(110);
  write(count ? `${count} question${count === 1 ? '' : 's'}` : 'Question paper', { size: 9, gap: 12 });
  doc.setTextColor(17);

  if (paper.kind === 'raw') {
    write(paper.text, { size: 9 });
  } else if (paper.kind === 'aptitude') {
    paper.items.forEach((q, i) => {
      ensureRoom(60);
      write(`Q${i + 1}. ${q.question}`, { size: 11, style: 'bold', gap: 2 });
      const meta = [q.difficulty, q.marks !== undefined ? `${q.marks} marks` : '']
        .filter(Boolean)
        .join(' · ');
      if (meta) {
        doc.setTextColor(110);
        write(meta, { size: 8, gap: 4 });
        doc.setTextColor(17);
      }
      q.options.forEach((o) => {
        const isAnswer = includeAnswers && o.key === q.correctAnswer;
        write(`${o.key}. ${o.text}`, {
          size: 10,
          style: isAnswer ? 'bold' : 'normal',
          gap: 1,
          indent: 16,
        });
      });
      if (includeAnswers && q.correctAnswer) {
        doc.setTextColor(20, 122, 61);
        write(`Answer: ${q.correctAnswer}`, { size: 9, gap: 2, indent: 16 });
        doc.setTextColor(17);
      }
      if (includeAnswers && q.explanation) {
        writeLabelled('Explanation', q.explanation);
      }
      writeExtras(q.extras);
      y += 8;
    });
  } else {
    paper.items.forEach((q, i) => {
      ensureRoom(70);
      write(`Q${i + 1}. ${q.title}`, { size: 11, style: 'bold', gap: 2 });
      const meta = [q.difficulty, q.marks !== undefined ? `${q.marks} marks` : '']
        .filter(Boolean)
        .join(' · ');
      if (meta) {
        doc.setTextColor(110);
        write(meta, { size: 8, gap: 4 });
        doc.setTextColor(17);
      }
      write(q.description, { size: 10, gap: 4 });
      if (q.constraints) writeLabelled('Constraints', q.constraints);
      if (q.sampleInput) write(`Sample input:  ${q.sampleInput}`, { size: 9, gap: 2, indent: 12 });
      if (q.sampleOutput) write(`Sample output: ${q.sampleOutput}`, { size: 9, gap: 2, indent: 12 });

      // The expected outputs are the answer key for a coding question.
      if (q.testCases.length && includeAnswers) {
        doc.setTextColor(110);
        write(`Test cases (${q.testCases.length})`, { size: 8, gap: 2 });
        doc.setTextColor(17);
        q.testCases.forEach((tc, n) => {
          const hidden = tc.isHidden ? '  (hidden)' : '';
          write(`${n + 1}. Input: ${tc.input || '(empty)'}${hidden}`, {
            size: 9,
            gap: 1,
            indent: 12,
          });
          write(`   Expected: ${tc.expectedOutput || '(empty)'}`, {
            size: 9,
            gap: 3,
            indent: 12,
          });
        });
      } else if (q.testCases.length) {
        doc.setTextColor(110);
        write(`${q.testCases.length} test case${q.testCases.length === 1 ? '' : 's'}`, {
          size: 8,
          gap: 2,
        });
        doc.setTextColor(17);
      }

      if (includeAnswers && q.solution) writeLabelled('Reference solution', q.solution);
      writeExtras(q.extras);
      y += 8;
    });
  }

  return doc;
}

/** Builds the PDF and hands it to the browser as a download. */
export async function downloadAsPdf(
  title: string,
  paper: ParsedPaper,
  filename: string,
  options: { includeAnswers?: boolean } = {},
): Promise<void> {
  const doc = await buildPaperPdf(title, paper, options);
  doc.save(filename);
}

/** Triggers a browser download for a generated blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `.doc` that Word and Google Docs open — HTML under a Word MIME type. */
export function downloadAsWord(html: string, filename: string): void {
  const withNamespace = html.replace(
    '<html>',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
  );
  downloadBlob(new Blob([withNamespace], { type: 'application/msword' }), filename);
}

/**
 * Renders into a window the caller already opened (so the popup is still tied
 * to the click) and asks it to print — "Save as PDF" in the print dialog.
 */
export function printHtmlInWindow(win: Window | null, html: string): boolean {
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the document a tick to lay out before the print dialog measures it.
  setTimeout(() => win.print(), 250);
  return true;
}

/** Swaps a filename's extension, e.g. paper.json → paper.doc */
export function withExtension(filename: string, extension: string): string {
  return `${filename.replace(/\.[^./\\]+$/, '')}.${extension}`;
}
