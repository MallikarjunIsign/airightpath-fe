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

export interface ResultDetail {
  questionId: number;
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  marks: number;
}
