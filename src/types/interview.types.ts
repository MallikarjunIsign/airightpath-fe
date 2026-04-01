export type AttemptStatus = "NOT_ATTEMPTED" | "IN_PROGRESS" | "COMPLETED";
export type InterviewResult = "PENDING" | "PASSED" | "FAILED";
export type Recommendation =
  | "STRONG_HIRE"
  | "HIRE"
  | "NO_HIRE"
  | "STRONG_NO_HIRE";
export type CompletionReason =
  | "NATURAL_COMPLETION"
  | "EARLY_TERMINATION_POOR_PERFORMANCE"
  | "CANDIDATE_ENDED"
  | "PROCTORING_VIOLATION"
  | "TIMEOUT"
  | "MAX_SKIPS";

export interface EvaluationCategory {
  id?: number;
  jobPrefix: string;
  categoryName: string;
  weight: number;
  description?: string;
}

export interface EvaluationScore {
  categoryName: string;
  score: number;
  weight: number;
  feedback: string;
}

export interface InterviewEvaluation {
  overallScore: number;
  overallFeedback: string;
  categoryScores: EvaluationScore[];
  recommendation: Recommendation;
}

export interface BulkInterviewAssignRequest {
  emails: string[];
  jobPrefix: string;
  deadlineTime: string;
  sendEmail: boolean;
}

export interface AudioChunkResponse {
  text: string;
  chunkIndex: number;
}

export interface InterviewSchedule {
  id: number;
  jobPrefix: string;
  email: string;
  attemptStatus: AttemptStatus;
  interviewResult: InterviewResult;
  recordReferences?: string;
  summaryReferences?: string;
  assignedAt: string;
  deadlineTime: string;
  evaluation?: InterviewEvaluation;
  proctoringWarnings?: number;
  warningCount?: number;
  startedAt?: string;
  endedAt?: string;
  evaluationJson?: string;
  completionReason?: CompletionReason;
}

export interface StartInterviewRequest {
  email: string;
  jobPrefix: string;
  resumeSummary?: string;
}

export interface StartInterviewResponse {
  sessionId: string;
  firstQuestion: string;
}

// In interview.types.ts
export interface AnswerQuestionRequest {
  interviewScheduleId: number;
  answer: string; // Changed from conversationHistory
  finalAnswer?: boolean;
  jobPrefix: string;
}

export interface AnswerQuestionResponse {
  nextQuestion: string;
  isComplete: boolean;
  summary?: string;
  evaluation?: InterviewEvaluation;
}

export type ConversationEntry = {
  role: "interviewer" | "candidate" | "filler" | "system";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isCodingQuestion?: boolean;
  codeContent?: string;
  codeLanguage?: string;
};

// ==================== Voice Interview Types ====================

export type VoiceInterviewState =
  | "pre-start"
  | "starting"
  | "active"
  | "answering"
  | "processing"
  | "completed"
  | "error";

// Voice interview REST types
export interface VoiceStartResponse {
  scheduleId: number;
  firstQuestion: string;
  interviewerName: string;
  firstQuestionAudio: string | null; // base64 mp3
}

export interface VoiceSessionStatus {
  scheduleId: number;
  status: string;
  totalQuestionsAsked: number;
  warningCount: number;
  startedAt: string;
  interviewerName: string;
}

// Word-level timestamp from Whisper
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// WebSocket message types
export interface TranscriptionMessage {
  text: string;
  words: WordTimestamp[];
  duration: number;
  chunkIndex: number;
}

export interface AITokenMessage {
  token: string;
  done: boolean;
  fullText?: string;
}

export interface TTSAudioMessage {
  audio: string; // base64 mp3
  chunkIndex: number;
  isLast: boolean;
  text: string;
}

export interface TTSFallbackMessage {
  text: string;
}

export interface FillerMessage {
  text: string;
  type: "filler";
}

// In interview.types.ts
export interface ResponseCompleteMessage {
  response?: string; // The feedback + next question or summary
  error?: string;
  questionsAsked: number;
  isComplete: boolean;
  terminated: boolean;
}

// Voice evaluation types
export interface VoiceEvaluationResult {
  overallScore: number;
  recommendation: Recommendation;
  categoryScores: VoiceCategoryScore[];
  speechAnalysis: SpeechAnalysis;
  summary: string;
  strengths: string[];
  areasForImprovement: string[];
}

export interface VoiceCategoryScore {
  category: string;
  score: number;
  weight: number;
  feedback: string;
}

export interface SpeechAnalysis {
  averageWordsPerMinute: number;
  totalFillerWords: number;
  confidenceScore: number;
  paceAssessment: string;
  articulationFeedback: string;
}

// Item 4: Resume response
export interface ResumeResponse {
  hasActiveSession: boolean;
  scheduleId?: number;
  currentQuestionIndex?: number;
  warningCount?: number;
  conversationHistory?: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
}

// Item 15: Proctoring event
export interface ProctoringEvent {
  id: number;
  scheduleId: number;
  eventType: string;
  details: string;
  timestamp: string;
}

// Item 16: Interview stats
export interface InterviewStats {
  totalInterviews: number;
  passRate: number;
  avgScore: number;
  avgDurationMinutes: number;
}
