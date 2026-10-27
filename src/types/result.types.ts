export interface Result {
  id: number;
  candidateEmail: string;
  assessmentType: 'APTITUDE' | 'CODING';
  score: number;
  status?: 'PASSED' | 'FAILED';
  totalMarks?: number;
  percentage?: number;
  resultsJson?: string;
  submittedAt?: string;
  createdAt?: string;
  jobPrefix?: string;
}

/**
 * How an attempt ended — written by the exam page, read by the result screens.
 *
 * It travels as the final entry of the result's `resultsJson` array rather than
 * as its own column: the server stores that field verbatim and never parses it,
 * so this needed no schema change. `result.utils` splits it back out, and every
 * reader goes through there — an entry carrying `__submissionMeta` is never an
 * answer and must never be counted as one.
 */
export interface SubmissionMeta {
  __submissionMeta: true;
  /** Did the candidate press Submit, or did the exam end itself? */
  mode: 'MANUAL' | 'AUTO';
  /** Why it auto-submitted, in the words the candidate was shown. */
  reason?: string;
  /** Client clock at submit. The server stamps its own `submittedAt` too. */
  submittedAt?: string;
  /** Seconds still on the exam clock when it went in. */
  secondsLeft?: number;
  /** The full exam clock, so time spent can be derived from what is left. */
  durationSeconds?: number;
}

/** One entry of an APTITUDE result's `resultsJson` — every question on the paper. */
export interface AptitudeAnswer {
  questionId?: number;
  questionText?: string;
  question?: string;
  selectedAnswer?: string;
  correctAnswer?: string;
  isCorrect?: boolean;
  marks?: number;
  Difficulty?: string;
  category?: string;
}

/** One entry of a CODING result's `resultsJson` — including questions never opened. */
export interface CodingAnswer {
  questionId?: number | string;
  title?: string;
  code?: string;
  language?: string;
  status?: string;
}

export interface ResultDetail {
  questionId: number;
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  marks: number;
}
