/**
 * Turning a raw question paper into the shape the exam UI renders.
 *
 * Papers reach the client in more than one dialect: options arrive as an object
 * (`{"A": "..."}`) from the current backend and as a positional array from older
 * papers, the question text lives under `question` or `questionText`, and ids
 * are numbers, strings or absent. Every screen that shows a question has to cope
 * with all of it.
 *
 * These live here rather than inside a page because both the candidate's exam
 * and Test Mode's rehearsal of it must normalise identically — a preview that
 * renders a paper differently from the real exam is worse than no preview, since
 * it would send someone away confident about a screen they never actually saw.
 */
import type {
  CodingQuestion,
  Question,
  RawCodingQuestion,
  RawQuestion,
} from '@/types/assessment.types';

/** Option keys for papers that ship options as a bare array: A, B, C, … */
function positionalKey(index: number): string {
  return String.fromCharCode(65 + index);
}

export function normalizeAptitudeQuestions(raw: RawQuestion[]): Question[] {
  return raw.map((q, idx) => {
    let options: { key: string; text: string }[];
    if (Array.isArray(q.options)) {
      options = q.options.map((text, i) => ({ key: positionalKey(i), text: String(text) }));
    } else if (q.options && typeof q.options === 'object') {
      options = Object.entries(q.options).map(([key, text]) => ({ key, text: String(text) }));
    } else {
      options = [];
    }

    return {
      id: q.id ?? idx + 1,
      questionText: q.questionText || q.question || '',
      options,
      correctAnswer: q.correctAnswer,
      marks: q.marks,
    };
  });
}

export function normalizeCodingQuestions(raw: RawCodingQuestion[]): CodingQuestion[] {
  return raw.map((q, idx) => ({
    // String ids are replaced by position rather than parsed: the exam keys its
    // per-question state by a number, and "1" from one paper must not collide
    // with 1 from another.
    id: typeof q.id === 'string' ? idx + 1 : (q.id ?? idx + 1),
    title: q.title || `Problem ${idx + 1}`,
    description: q.description || q.question || '',
    sampleInput: q.sampleInput,
    sampleOutput: q.sampleOutput,
    testCases: q.testCases,
    marks: q.marks,
  }));
}

/** Marks a paper is out of, defaulting each question to one mark. */
export function paperTotalMarks(questions: Question[]): number {
  return questions.reduce((total, q) => total + (q.marks || 1), 0);
}
