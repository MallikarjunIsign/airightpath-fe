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
