export interface Assessment {
  id: number;
  assessmentType: 'APTITUDE' | 'CODING';
  uploadedBy: string;
  candidateEmail: string;
  questionPaper?: string;
  examAttended: boolean;
  expired: boolean;
  adminAcceptance: boolean;
  adminComments?: string;
  assignedAt: string;
  startTime?: string;
  deadline: string;
  jobPrefix: string;
  containerName?: string;
  fileName?: string;
  /**
   * Timing chosen by the admin when this assessment was assigned. Both are
   * optional: assignments made before per-question timing existed carry
   * neither, and the exam falls back to the configured default for its type.
   * See utils/exam-duration.utils.ts for how they combine.
   */
  minutesPerQuestion?: number;
  /** A fixed whole-exam duration, which overrides the per-question maths. */
  durationMinutes?: number;
}

// Raw question shape from BE — options is Map<String,String> e.g. {"A":"…","B":"…"}
// Also supports legacy array format
export interface RawQuestion {
  id: number;
  question?: string;
  questionText?: string;
  options: Record<string, string> | string[];
  correctAnswer?: string;
  category?: string;
  Difficulty?: string;
  marks?: number;
}

// Normalised shape used by the exam UI
export interface Question {
  id: number;
  questionText: string;
  options: { key: string; text: string }[];
  correctAnswer?: string;
  marks?: number;
}

// Raw coding question from BE
export interface RawCodingQuestion {
  id: number | string;
  title?: string;
  question?: string;
  description?: string;
  Difficulty?: string;
  sampleInput?: string;
  sampleOutput?: string;
  testCases?: TestCase[];
  marks?: number;
}

// Normalised coding question for exam UI
export interface CodingQuestion {
  id: number;
  title: string;
  description: string;
  sampleInput?: string;
  sampleOutput?: string;
  testCases?: TestCase[];
  marks?: number;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
}

export interface AssignAssessmentDto {
  jobPrefix: string;
  candidateEmails: string[];
  assessmentType: 'APTITUDE' | 'CODING';
  startTime: string;
  deadline: string;
  /** Per-question allowance; the exam clock is this times the question count. */
  minutesPerQuestion?: number;
  /** The resulting whole-exam duration, sent so the backend need not recompute. */
  durationMinutes?: number;
}

export interface AssessmentSubmission {
  assessmentId: number;
  answers: Record<number, string>;
}

export interface AssessmentResult {
  candidateEmail: string;
  assessmentType: string;
  score: number;
  resultsJson: string;
  jobPrefix: string;
  /**
   * The assessment actually sat. A re-assigned exam leaves several rows of the
   * same type on the same job, so without this the server can only guess which
   * attempt a result belongs to.
   */
  assessmentId?: number;
}
