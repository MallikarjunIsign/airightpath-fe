/**
 * Reading question papers from wherever Test Mode got them.
 *
 * A paper can arrive from a bundled sample, a file an admin picked, the AI
 * generator or an assessment already assigned on a job. Only the first is
 * trustworthy by construction, so everything funnels through the validators
 * here and comes back as either usable questions or a message precise enough to
 * fix the file with — "expected an array of questions, got an object" tells the
 * admin what to change, where a blank screen does not.
 */
import type { RawQuestion, RawCodingQuestion } from '@/types/assessment.types';

export type PaperKind = 'aptitude' | 'coding';

export type ParseResult<T> = { ok: true; questions: T[] } | { ok: false; error: string };

/** Papers above this size are almost certainly not question papers. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** How many questions we will accept in one paper, as a sanity bound. */
const MAX_QUESTIONS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Pulls the question array out of whatever wrapper it came in.
 *
 * The generator returns a bare array, `fetchAssessment` returns a JSON string
 * inside a field, and hand-made files sometimes wrap the array in
 * `{ questions: [...] }`. All three are the same paper.
 */
function unwrapArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ['questions', 'data', 'questionPaper', 'items']) {
      const inner = value[key];
      if (Array.isArray(inner)) return inner;
    }
  }
  return null;
}

function describeShape(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return `a ${typeof value}`;
}

/**
 * Aptitude options as the exam UI needs them: at least two choices, each with a
 * key and a label. Accepts both the object form (`{"A": "..."}`) the backend
 * sends and the legacy positional array.
 */
function validOptions(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length >= 2 && value.every((option) => nonEmptyString(option));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length >= 2 && entries.every(([key, label]) => key.trim() !== '' && nonEmptyString(label));
  }
  return false;
}

/** Where a question keeps its text, across the shapes in circulation. */
function questionText(entry: Record<string, unknown>): unknown {
  return entry.questionText ?? entry.question;
}

export function parseAptitudePaper(value: unknown): ParseResult<RawQuestion> {
  const list = unwrapArray(value);
  if (!list) {
    return { ok: false, error: `Expected an array of questions, but the file contained ${describeShape(value)}.` };
  }
  if (list.length === 0) {
    return { ok: false, error: 'The paper is empty — it contains no questions.' };
  }
  if (list.length > MAX_QUESTIONS) {
    return { ok: false, error: `The paper has ${list.length} questions, more than the ${MAX_QUESTIONS} Test Mode will load.` };
  }

  for (let index = 0; index < list.length; index++) {
    const entry = list[index];
    const position = `Question ${index + 1}`;
    if (!isRecord(entry)) {
      return { ok: false, error: `${position} is ${describeShape(entry)}, not an object.` };
    }
    if (!nonEmptyString(questionText(entry))) {
      return { ok: false, error: `${position} has no "question" or "questionText" text.` };
    }
    if (!validOptions(entry.options)) {
      return {
        ok: false,
        error: `${position} needs an "options" object like {"A": "...", "B": "..."} with at least two choices.`,
      };
    }
  }

  // Ids are normalised rather than rejected: a paper is still perfectly usable
  // when it numbers its questions as strings, or not at all.
  const questions = list.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const rawId = record.id;
    const id = typeof rawId === 'number' ? rawId : Number(rawId);
    return {
      ...record,
      id: Number.isFinite(id) ? id : index + 1,
    } as RawQuestion;
  });

  return { ok: true, questions };
}

export function parseCodingPaper(value: unknown): ParseResult<RawCodingQuestion> {
  const list = unwrapArray(value);
  if (!list) {
    return { ok: false, error: `Expected an array of questions, but the file contained ${describeShape(value)}.` };
  }
  if (list.length === 0) {
    return { ok: false, error: 'The paper is empty — it contains no questions.' };
  }
  if (list.length > MAX_QUESTIONS) {
    return { ok: false, error: `The paper has ${list.length} questions, more than the ${MAX_QUESTIONS} Test Mode will load.` };
  }

  for (let index = 0; index < list.length; index++) {
    const entry = list[index];
    const position = `Question ${index + 1}`;
    if (!isRecord(entry)) {
      return { ok: false, error: `${position} is ${describeShape(entry)}, not an object.` };
    }
    // A coding question is identified by its title, and the statement may live
    // under either "question" or "description" — both are in use.
    if (!nonEmptyString(entry.title) && !nonEmptyString(entry.question)) {
      return { ok: false, error: `${position} has neither a "title" nor a "question".` };
    }
    if (entry.testCases !== undefined && !Array.isArray(entry.testCases)) {
      return { ok: false, error: `${position} has a "testCases" field that is not an array.` };
    }
  }

  const questions = list.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const rawId = record.id;
    const numeric = typeof rawId === 'number' ? rawId : Number(rawId);
    return {
      ...record,
      // Coding ids are strings in the sample papers and numbers elsewhere; the
      // type allows both, so only a genuinely absent id is filled in.
      id: rawId === undefined || rawId === null || rawId === '' ? index + 1 : (Number.isFinite(numeric) ? numeric : String(rawId)),
    } as RawCodingQuestion;
  });

  return { ok: true, questions };
}

/**
 * Reads a picked file and validates it as a paper of the given kind.
 *
 * Rejects rather than throws, because every failure here is something the admin
 * can act on and should therefore be rendered, not logged.
 */
export async function readPaperFile(file: File, kind: PaperKind): Promise<ParseResult<RawQuestion | RawCodingQuestion>> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — larger than the 5 MB limit.` };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: `Could not read ${file.name}.` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // The parser's own message names the offending position, which is far more
    // useful than "invalid JSON" when a paper is one comma away from working.
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: `${file.name} is not valid JSON: ${detail}` };
  }

  return kind === 'aptitude' ? parseAptitudePaper(parsed) : parseCodingPaper(parsed);
}

/**
 * The question payload stored on an assessment is a JSON string, so a paper
 * loaded from a real assignment needs unwrapping before validation.
 */
export function parseStoredPaper(
  raw: string | undefined,
  kind: PaperKind,
): ParseResult<RawQuestion | RawCodingQuestion> {
  if (!raw || raw.trim() === '') {
    return { ok: false, error: 'That assessment has no question paper stored against it.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'The stored question paper is not readable JSON.' };
  }
  return kind === 'aptitude' ? parseAptitudePaper(parsed) : parseCodingPaper(parsed);
}
