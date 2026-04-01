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
}
