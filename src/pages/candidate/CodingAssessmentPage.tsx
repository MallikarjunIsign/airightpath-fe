import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import {
  Clock,
  Play,
  Send,
  Save,
  AlertTriangle,
  Terminal,
  CheckCircle,
  XCircle,
  Camera,
  EyeOff,
  Loader2,
  Users,
  AlertOctagon,
  TimerOff,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  Code2,
  Lock,
  FileWarning,
  Lightbulb,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import { extractApiError } from '@/services/api.service';
import { useTimer } from '@/hooks/useTimer';
import { useExamProctoring } from '@/hooks/useExamProctoring';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { APP_CONFIG } from '@/config/app.config';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';
import {
  CameraRequiredOverlay,
  DesktopRequiredOverlay,
  FullscreenRequiredOverlay,
} from '@/components/exam/ExamOverlays';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { ROUTES } from '@/config/routes';
import { formatTimer } from '@/utils/format.utils';
import { computeExamMinutes } from '@/utils/exam-duration.utils';
import { LANGUAGE_SKELETONS, isSkeletonCode } from '@/utils/code.utils';
import {
  errorKind,
  isGraded,
  isPassed,
  ranCleanly,
  statusLabel,
  statusTone,
} from '@/utils/compiler.utils';
import type { Assessment, CodingQuestion, RawCodingQuestion } from '@/types/assessment.types';
import type { CodeSubmissionResponse, CodeErrorInfo } from '@/types/compiler.types';

// ── Constants ────────────────────────────────────────────────────────
const MONACO_LANG_MAP: Record<string, string> = {
  java: 'java',
  python: 'python',
  c: 'c',
  cpp: 'cpp',
  javascript: 'javascript',
};

// LANGUAGE_SKELETONS and isSkeletonCode were duplicated here, byte-for-byte,
// alongside the copies in utils/code.utils.ts. Two definitions of "the
// candidate never touched this" is a hazard: the admin result view grades
// attempted/not-attempted with that copy while the exam offered this one, so
// any drift between the two would score a candidate against a template they
// were never shown. One source now, imported below.

function normalizeCodingQuestions(raw: RawCodingQuestion[]): CodingQuestion[] {
  return raw.map((q, idx) => ({
    id: typeof q.id === 'string' ? idx + 1 : (q.id ?? idx + 1),
    title: q.title || `Problem ${idx + 1}`,
    description: q.description || q.question || '',
    sampleInput: q.sampleInput,
    sampleOutput: q.sampleOutput,
    testCases: q.testCases,
    marks: q.marks,
  }));
}

type QuestionStatus = 'not_started' | 'in_progress' | 'saved' | 'submitted';

// ── Component ────────────────────────────────────────────────────────
export function CodingAssessmentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const navState = location.state as
    | { assessment?: Assessment; durationMinutes?: number }
    | null;
  const assessment = navState?.assessment;
  // The instructions screen already counted the paper and told the candidate
  // how long they get; honour that number rather than deriving a second one.
  const agreedDurationMinutes = navState?.durationMinutes;

  // Core state
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [code, setCode] = useState(LANGUAGE_SKELETONS.java);
  const [language, setLanguage] = useState('java');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [outputHeight, setOutputHeight] = useState(256);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'input'>('output');

  // Compiler output state — matches real BE response
  const [compilerResponse, setCompilerResponse] = useState<CodeSubmissionResponse | null>(null);
  const [currentError, setCurrentError] = useState<CodeErrorInfo | null>(null);

  // Per-question state
  const [codePerQuestion, setCodePerQuestion] = useState<Record<number, string>>({});
  const [langPerQuestion, setLangPerQuestion] = useState<Record<number, string>>({});
  const [questionStatus, setQuestionStatus] = useState<Record<number, QuestionStatus>>({});
  // Per-(question, language) code, so switching language loads that language's
  // starter code (or your prior code for it) rather than keeping the old text.
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>({});

  // Refs
  const isSubmittingRef = useRef(false);
  const isDesktop = useIsDesktop();
  const initRef = useRef(false);
  const proctoring = PROCTORING_CONFIG;
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // Stable refs for callbacks
  const questionsRef = useRef<CodingQuestion[]>([]);
  const codePerQuestionRef = useRef<Record<number, string>>({});
  const langPerQuestionRef = useRef<Record<number, string>>({});
  const questionStatusRef = useRef<Record<number, QuestionStatus>>({});
  questionsRef.current = questions;
  codePerQuestionRef.current = codePerQuestion;
  langPerQuestionRef.current = langPerQuestion;
  questionStatusRef.current = questionStatus;

  // ── Proctoring (fullscreen, tab, face/eye, camera) ───────────────────
  const autoSubmitRef = useRef<(reason: string) => void>(() => {});
  const proctor = useExamProctoring({
    loading,
    onAutoSubmit: (reason) => autoSubmitRef.current(reason),
  });
  const {
    videoRef,
    camera,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    tabWarnings,
    warningCount,
    fullscreenExitCount,
    totalWarnings,
    faceDetected,
    multipleFaces,
    setupCamera,
    stopDetection,
    begin: beginProctoring,
    markActive,
    markInactive,
  } = proctor;

  // ── Timer ──────────────────────────────────────────────────────────
  // Coding papers are timed per problem (25 minutes each by default), so the
  // real duration is only known once the paper has loaded — init resets it.
  const { secondsLeft, start: startTimer, reset: resetTimer } = useTimer({
    initialSeconds: APP_CONFIG.EXAM_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => handleAutoSubmit('Time is up!'),
  });

  // ── Monaco editor helpers ─────────────────────────────────────────
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const clearEditorMarkers = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'compiler', []);
  }, []);

  const setEditorMarkers = useCallback((errorInfo: CodeErrorInfo) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const line = errorInfo.line ?? 1;
    const safeLine = Math.max(1, Math.min(line, model.getLineCount()));

    const kind = errorKind(errorInfo).toLowerCase();
    const isCompilation = kind.includes('compilation') || kind.includes('syntax');

    monaco.editor.setModelMarkers(model, 'compiler', [{
      startLineNumber: safeLine,
      startColumn: 1,
      endLineNumber: safeLine,
      endColumn: model.getLineMaxColumn(safeLine),
      message: errorInfo.message || errorInfo.fullTrace || 'Error',
      severity: isCompilation ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    }]);

    // Scroll to the error line
    editor.revealLineInCenter(safeLine);
  }, []);

  /** Process compiler response — extract errors and set markers */
  const processCompilerResponse = useCallback((res: CodeSubmissionResponse) => {
    setCompilerResponse(res);

    // Find the first error in test results
    const errorResult = res.testResults?.find((tr) => tr.errorInfo);
    if (errorResult?.errorInfo) {
      setCurrentError(errorResult.errorInfo);
      setEditorMarkers(errorResult.errorInfo);
    } else {
      // Check if actualOutput contains "Runtime Error:"
      const runtimeErr = res.testResults?.find(
        (tr) => tr.actualOutput?.startsWith('Runtime Error:')
      );
      if (runtimeErr) {
        const errInfo: CodeErrorInfo = {
          exception: 'RuntimeError',
          message: runtimeErr.actualOutput.replace('Runtime Error: ', ''),
          fullTrace: runtimeErr.actualOutput,
        };
        setCurrentError(errInfo);
      } else {
        setCurrentError(null);
        clearEditorMarkers();
      }
    }
  }, [setEditorMarkers, clearEditorMarkers]);

  // ── Submit entire exam ────────────────────────────────────────────
  const handleSubmitExam = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setShowConfirmSubmit(false);
    stopDetection();
    markInactive();

    try {
      if (!assessment || !user?.email) return;

      const qs = questionsRef.current;
      const codes = { ...codePerQuestionRef.current };
      const langs = { ...langPerQuestionRef.current };
      const statuses = { ...questionStatusRef.current };

      // Save current editor state
      const currentQ = qs[currentIndex];
      if (currentQ) {
        codes[currentQ.id] = code;
        langs[currentQ.id] = language;
      }

      await assessmentService.saveResult({
        candidateEmail: user.email,
        assessmentType: assessment.assessmentType,
        score: 0,
        resultsJson: JSON.stringify(
          qs.map((q) => ({
            questionId: q.id,
            title: q.title,
            code: codes[q.id] || '',
            language: langs[q.id] || 'java',
            status: statuses[q.id] || 'not_started',
          }))
        ),
        jobPrefix: assessment.jobPrefix,
      });

      showToast(MESSAGES.exam.codingSubmitted, 'success');
      await exitFullscreen();
      navigate(ROUTES.CANDIDATE.RESULTS);
    } catch {
      // Error toast auto-handled
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
      // Submit failed (or was skipped) — the exam continues, so re-arm the
      // counters and the reload prompt. Harmless on the success path: the
      // redirect to results has already unmounted this page.
      markActive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, user?.email, currentIndex, code, language]);

  const handleAutoSubmit = useCallback(
    (reason: string) => {
      if (isSubmittingRef.current) return;
      showToast(MESSAGES.proctoring.autoSubmitting(reason), 'error');
      handleSubmitExam();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSubmitExam]
  );

  // Keep the proctoring hook's auto-submit pointing at the latest handler.
  useEffect(() => {
    autoSubmitRef.current = handleAutoSubmit;
  });

  // ── Initialize exam ───────────────────────────────────────────────
  useEffect(() => {
    async function initExam() {
      if (!assessment?.id || initRef.current) return;
      initRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await assessmentService.fetchQuestions(assessment.id);
        const raw = res.data.questions;

        let parsed: RawCodingQuestion[];
        if (!raw) throw new Error('No questions found for this assessment.');
        else if (typeof raw === 'string') parsed = JSON.parse(raw);
        else parsed = raw as unknown as RawCodingQuestion[];

        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('No questions found for this assessment.');
        }

        const normalized = normalizeCodingQuestions(parsed);
        setQuestions(normalized);

        const initialStatuses: Record<number, QuestionStatus> = {};
        normalized.forEach((q) => { initialStatuses[q.id] = 'not_started'; });
        setQuestionStatus(initialStatuses);

        // Now that the paper is counted, set the clock: per-question time x
        // questions, unless the instructions screen already fixed a duration.
        const minutes = computeExamMinutes({
          type: assessment.assessmentType,
          questionCount: normalized.length,
          minutesPerQuestion: assessment.minutesPerQuestion,
          durationMinutes: agreedDurationMinutes ?? assessment.durationMinutes,
        });
        resetTimer(minutes * 60);

        // Proctoring init: fullscreen → face models → camera (config-driven).
        await beginProctoring();

        if (user?.email) {
          await assessmentService.markAttended({
            assessmentId: assessment.id,
            candidateEmail: user.email,
          });
        }

        // Proctoring counters go live only now — after all permission prompts.
        markActive();
        startTimer();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load coding questions.');
      } finally {
        setLoading(false);
      }
    }
    initExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resizable output panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setOutputHeight(Math.max(100, Math.min(rect.bottom - e.clientY, rect.height - 100)));
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDragStart = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Language change ───────────────────────────────────────────────
  const handleLanguageChange = (newLanguage: string) => {
    if (newLanguage === language) return;
    const currentQ = questions[currentIndex];
    // Load the new language's predefined starter code (or your prior code for it)
    // and refresh the editor. Stash the current code under its language so nothing
    // is lost if you switch back.
    if (currentQ) {
      setCodeByLang((prev) => ({ ...prev, [`${currentQ.id}:${language}`]: code }));
      setLangPerQuestion((prev) => ({ ...prev, [currentQ.id]: newLanguage }));
      const saved = codeByLang[`${currentQ.id}:${newLanguage}`];
      setCode(saved ?? LANGUAGE_SKELETONS[newLanguage] ?? `// Write your ${newLanguage} code here\n`);
    } else {
      setCode(LANGUAGE_SKELETONS[newLanguage] ?? `// Write your ${newLanguage} code here\n`);
    }
    setLanguage(newLanguage);
    clearEditorMarkers();
  };

  // ── Switch questions ──────────────────────────────────────────────
  const handleQuestionSwitch = (newIndex: number) => {
    const currentQ = questions[currentIndex];
    if (currentQ) {
      setCodePerQuestion((prev) => ({ ...prev, [currentQ.id]: code }));
      setLangPerQuestion((prev) => ({ ...prev, [currentQ.id]: language }));
      if (questionStatus[currentQ.id] === 'not_started' && code.trim() && !isSkeletonCode(code)) {
        setQuestionStatus((prev) => ({ ...prev, [currentQ.id]: 'in_progress' }));
      }
    }
    setCurrentIndex(newIndex);
    const nextQ = questions[newIndex];
    if (nextQ) {
      setCode(codePerQuestion[nextQ.id] || LANGUAGE_SKELETONS[langPerQuestion[nextQ.id] || language] || '');
      setLanguage(langPerQuestion[nextQ.id] || language);
    }
    setCompilerResponse(null);
    setCurrentError(null);
    setCustomInput('');
    clearEditorMarkers();
    setActiveOutputTab('output');
  };

  /**
   * Guards every path that ships the editor's contents to the compiler.
   *
   * An empty script is rejected server-side, and that failure comes back as a
   * compiler error — which reads to the candidate as "your code is broken"
   * rather than "you haven't written any", and sends them hunting for a bug
   * that does not exist. Saying so here is both truthful and instant.
   */
  const hasCodeToSend = (): boolean => {
    if (code.trim()) return true;
    showToast(MESSAGES.exam.codeRequired, 'warning');
    return false;
  };

  // ── Compile & Run ────────────────────────────────────────────────
  const handleCompileAndRun = async () => {
    if (!hasCodeToSend()) return;
    const currentQ = questions[currentIndex];
    setRunning(true);
    setCompilerResponse(null);
    setCurrentError(null);
    clearEditorMarkers();
    setActiveOutputTab('output');
    try {
      const hasTests = (currentQ?.testCases?.length ?? 0) > 0;
      const res = await compilerService.runCode(
        {
          language,
          script: code,
          ...(hasTests
            ? { testCases: currentQ!.testCases }
            : { customInput: customInput || currentQ?.sampleInput || '' }),
          assessmentId: assessment?.id,
          questionId: currentQ?.id,
          userEmail: user?.email ?? undefined,
          jobPrefix: assessment?.jobPrefix,
          createdAt: new Date().toISOString(),
        },
        { _skipErrorToast: true },
      );
      processCompilerResponse(res.data);
    } catch (err) {
      // Three different failures, told apart because they need different
      // reactions: a timeout means fix the code, an unsupported language means
      // pick another, and an unavailable runner means wait — that last one is
      // our infrastructure, so it must not be presented as the candidate's bug.
      const timedOut = axios.isAxiosError(err) && err.code === 'ECONNABORTED';
      const { code } = extractApiError(err);

      let message: string = MESSAGES.exam.compileFailed;
      let kind = 'Error';
      let tone: 'warning' | 'error' = 'error';

      if (timedOut) {
        message = MESSAGES.exam.compileTimeout;
        kind = 'Timeout';
        tone = 'warning';
      } else if (code === 'COMPILER_UNAVAILABLE') {
        message = MESSAGES.exam.compilerUnavailable;
        kind = 'Unavailable';
        tone = 'warning';
      } else if (code === 'COMPILER_UNSUPPORTED_LANGUAGE') {
        message = MESSAGES.exam.compilerUnsupportedLanguage(language);
        kind = 'Unsupported';
        tone = 'warning';
      }

      setCurrentError({ exception: kind, message, fullTrace: message });
      showToast(message, tone);
    } finally {
      setRunning(false);
    }
  };

  // ── Save question (draft) ────────────────────────────────────────
  const handleSaveQuestion = async () => {
    const currentQ = questions[currentIndex];
    if (!currentQ || !assessment || !user?.email) return;
    // Empty only — saving an untouched template is a legitimate draft, and a
    // save is reversible in a way a submit is not.
    if (!hasCodeToSend()) return;

    setSavingQuestion(true);
    try {
      setCodePerQuestion((prev) => ({ ...prev, [currentQ.id]: code }));
      setLangPerQuestion((prev) => ({ ...prev, [currentQ.id]: language }));

      await compilerService.runCode({
        language,
        script: code,
        customInput: '',
        assessmentId: assessment.id,
        questionId: currentQ.id,
        userEmail: user.email,
        jobPrefix: assessment.jobPrefix,
        createdAt: new Date().toISOString(),
      });

      setQuestionStatus((prev) => ({ ...prev, [currentQ.id]: 'saved' }));
      showToast(MESSAGES.exam.questionSaved(currentIndex + 1), 'success');
    } catch {
      // Error toast auto-handled
    } finally {
      setSavingQuestion(false);
    }
  };

  // ── Submit question (final with test cases) ──────────────────────
  const handleSubmitQuestion = async () => {
    const currentQ = questions[currentIndex];
    if (!currentQ || !assessment || !user?.email) return;
    if (!hasCodeToSend()) return;
    // Stricter than save, because a submit locks the question: an untouched
    // template sent by accident would leave the candidate unable to answer it
    // at all. isSkeletonCode also covers empty, but that case was named above.
    if (isSkeletonCode(code)) {
      showToast(MESSAGES.exam.codeUnchanged, 'warning');
      return;
    }

    setSubmittingQuestion(true);
    setCompilerResponse(null);
    setCurrentError(null);
    clearEditorMarkers();
    try {
      setCodePerQuestion((prev) => ({ ...prev, [currentQ.id]: code }));
      setLangPerQuestion((prev) => ({ ...prev, [currentQ.id]: language }));

      const res = await compilerService.runCode({
        language,
        script: code,
        assessmentId: assessment.id,
        questionId: currentQ.id,
        userEmail: user.email,
        jobPrefix: assessment.jobPrefix,
        testCases: currentQ.testCases,
        createdAt: new Date().toISOString(),
      });

      processCompilerResponse(res.data);
      setQuestionStatus((prev) => ({ ...prev, [currentQ.id]: 'submitted' }));
      showToast(MESSAGES.exam.questionSubmitted(currentIndex + 1), 'success');
    } catch {
      // Error toast auto-handled
    } finally {
      setSubmittingQuestion(false);
    }
  };

  // ── UI helpers ────────────────────────────────────────────────────
  const warningColor =
    totalWarnings === 0
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      : totalWarnings <= 3
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';

  const getStatusBadge = (status: QuestionStatus) => {
    switch (status) {
      case 'submitted': return <Badge variant="success" size="sm">Submitted</Badge>;
      case 'saved': return <Badge variant="info" size="sm">Saved</Badge>;
      case 'in_progress': return <Badge variant="warning" size="sm">In Progress</Badge>;
      default: return <Badge variant="secondary" size="sm">Not Started</Badge>;
    }
  };

  const getStatusColor = (status: QuestionStatus) => {
    switch (status) {
      case 'submitted': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700';
      case 'saved': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700';
      case 'in_progress': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700';
      default: return 'bg-[var(--surface1)] text-[var(--textSecondary)] border-[var(--border)]';
    }
  };

  // ── Early returns ─────────────────────────────────────────────────
  if (!assessment) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">No assessment data found.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--primary)] mx-auto mb-4" />
          <p className="text-[var(--text)] font-medium">Loading coding questions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="text-center max-w-md mx-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Failed to Load Exam</h2>
          <p className="text-[var(--textSecondary)] mb-6">{error}</p>
          <Button onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}>
            Back to Assessments
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentQStatus = currentQuestion ? questionStatus[currentQuestion.id] : 'not_started';
  const isQuestionLocked = currentQStatus === 'submitted';
  const submittedCount = Object.values(questionStatus).filter((s) => s === 'submitted').length;
  const savedCount = Object.values(questionStatus).filter((s) => s === 'saved').length;
  const allSubmitted = submittedCount === questions.length;

  // Derive error display info
  const hasError = !!currentError;
  const errorName = currentError ? errorKind(currentError).toLowerCase() : '';
  const isCompilationError = errorName.includes('compilation') || errorName.includes('syntax');
  const isRuntimeError = errorName.includes('runtime');
  const isTimeout = errorName.includes('timeout');

  return (
    // h-screen, not min-h-screen: the page must be exactly the viewport so the
    // question panel and the editor own their own scrolling. With min-h-screen
    // the whole document grew instead, scrolling the editor and the timer out
    // of view together and making it impossible to read the question while
    // typing — which is the entire point of a two-pane layout.
    <div className="h-screen overflow-hidden bg-[var(--background)] flex flex-col">
      {/* Camera Required Overlay — blocks the exam until the camera is live */}
      {proctoring.camera.required &&
        !loading &&
        (camera.status === 'denied' ||
          camera.status === 'unavailable' ||
          camera.status === 'error') && (
          <CameraRequiredOverlay message={camera.message} onRetry={setupCamera} />
        )}

      {/* Sits above the others: on a phone none of the rest can be satisfied,
          and the editor has no keyboard to type into. */}
      {!isDesktop && <DesktopRequiredOverlay />}

      {/* Fullscreen overlay */}
      {proctoring.fullscreen.enabled && !isFullscreen && !loading && (
        <FullscreenRequiredOverlay onReturn={enterFullscreen} />
      )}

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      {/* flex-shrink-0 so the timer and warning count keep their height when
          the panes below are short; `sticky` is redundant now that the page
          itself no longer scrolls. */}
      <div className="flex-shrink-0 z-10 bg-[var(--cardBg)] border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="warning">CODING</Badge>
            <span className="text-sm text-[var(--textSecondary)]">{assessment.jobPrefix}</span>

            <div className="flex items-center gap-1 ml-2">
              {questions.map((q, idx) => {
                const qs = questionStatus[q.id] || 'not_started';
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleQuestionSwitch(idx)}
                    className={`
                      relative px-3 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium
                      ${isCurrent
                        ? 'bg-[var(--primary)] text-white shadow-md'
                        : `border ${getStatusColor(qs)} hover:opacity-80`
                      }
                    `}
                  >
                    Q{idx + 1}
                    {qs === 'submitted' && !isCurrent && (
                      <Lock size={8} className="absolute -top-1 -right-1 text-green-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`w-16 h-12 bg-black rounded overflow-hidden flex-shrink-0 relative ring-1 ${
                camera.status === 'active' ? 'ring-green-500/50' : 'ring-red-500/60'
              }`}
            >
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {camera.status !== 'active' && (
                <button
                  onClick={setupCamera}
                  title={camera.message ?? 'Camera off'}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-[9px] font-medium text-white/80 hover:bg-black/60"
                >
                  <Camera size={12} className="text-white/60" />
                  {camera.status === 'requesting' ? '…' : 'Retry'}
                </button>
              )}
            </div>

            {!faceDetected && proctoring.eyeDetection.enabled && (
              <div className="flex items-center gap-1 text-amber-500 animate-pulse">
                <EyeOff size={14} />
                <span className="text-xs font-medium">No face</span>
              </div>
            )}
            {multipleFaces && proctoring.eyeDetection.enabled && (
              <div className="flex items-center gap-1 text-red-500 animate-pulse">
                <Users size={14} />
                <span className="text-xs font-medium">Multiple faces</span>
              </div>
            )}

            <div className="relative group">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${warningColor}`}>
                <AlertTriangle size={12} />
                <span>{totalWarnings} warning{totalWarnings === 1 ? '' : 's'}</span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-52 p-2.5 rounded-lg bg-[var(--cardBg)] border border-[var(--border)] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-20">
                <p className="text-xs font-semibold text-[var(--text)] mb-1.5">Warnings</p>
                <div className="space-y-0.5 text-xs text-[var(--textSecondary)]">
                  {proctoring.tabSwitch.enabled && (
                    <p>
                      Tab switches: {tabWarnings}
                      {proctoring.tabSwitch.maxBeforeAutoSubmit > 0
                        ? ` / ${proctoring.tabSwitch.maxBeforeAutoSubmit}`
                        : ''}
                    </p>
                  )}
                  {proctoring.eyeDetection.enabled && (
                    <p>
                      Face / eye: {warningCount}
                      {proctoring.eyeDetection.maxBeforeAutoSubmit > 0
                        ? ` / ${proctoring.eyeDetection.maxBeforeAutoSubmit}`
                        : ''}
                    </p>
                  )}
                  {proctoring.fullscreen.enabled && <p>Fullscreen exits: {fullscreenExitCount}</p>}
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--textSecondary)] border-t border-[var(--border)] pt-1.5">
                  Reaching a limit auto-submits your exam. Do not reload this page — the
                  exam restarts from the beginning.
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-semibold ${
              secondsLeft <= 300 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-[var(--surface1)] text-[var(--text)]'
            }`}>
              <Clock size={14} />
              {formatTimer(secondsLeft)}
            </div>

            <Button variant="danger" size="sm" onClick={() => setShowConfirmSubmit(true)} leftIcon={<Send size={14} />}>
              Submit Exam
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────── */}
      {/* min-h-0 lets this row shrink inside the flex column. Without it a tall
          question pushes the row past the viewport and the body scrolls again,
          defeating the overflow-y-auto on the pane below. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Question Description — scrolls independently of the editor. */}
        <div className="w-[38%] border-r border-[var(--border)] overflow-y-auto scrollbar-thin flex flex-col">
          {currentQuestion && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 size={18} className="text-[var(--primary)]" />
                  <h2 className="text-lg font-bold text-[var(--text)]">{currentQuestion.title}</h2>
                </div>
                {getStatusBadge(currentQStatus)}
              </div>

              {isQuestionLocked && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <Lock size={14} className="text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-700 dark:text-green-400">
                    This question has been submitted and is locked.
                  </span>
                </div>
              )}

              <p className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                {currentQuestion.description}
              </p>

              {currentQuestion.sampleInput && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--textSecondary)] uppercase tracking-wider mb-1.5">Sample Input</h4>
                  <pre className="text-sm p-3 rounded-lg bg-[var(--surface2)] text-[var(--text)] font-mono overflow-x-auto border border-[var(--border)]">
                    {currentQuestion.sampleInput}
                  </pre>
                </div>
              )}

              {currentQuestion.sampleOutput && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--textSecondary)] uppercase tracking-wider mb-1.5">Sample Output</h4>
                  <pre className="text-sm p-3 rounded-lg bg-[var(--surface2)] text-[var(--text)] font-mono overflow-x-auto border border-[var(--border)]">
                    {currentQuestion.sampleOutput}
                  </pre>
                </div>
              )}

              {/* Question nav */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                <Button variant="outline" size="sm" onClick={() => handleQuestionSwitch(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} leftIcon={<ChevronLeft size={16} />}>
                  Prev
                </Button>
                <span className="text-xs text-[var(--textSecondary)]">{currentIndex + 1} / {questions.length}</span>
                <Button variant="outline" size="sm" onClick={() => handleQuestionSwitch(Math.min(questions.length - 1, currentIndex + 1))} disabled={currentIndex === questions.length - 1} rightIcon={<ChevronRight size={16} />}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Editor + Output — its own column, scrolling independently. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0" ref={containerRef}>
          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-[var(--cardBg)] border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="w-36">
                <Select options={APP_CONFIG.COMPILER_LANGUAGES} value={language} onChange={(e) => handleLanguageChange(e.target.value)} disabled={isQuestionLocked} />
              </div>
              {hasError && (
                <div className="flex items-center gap-1.5 text-red-500 text-xs font-medium">
                  <FileWarning size={14} />
                  {isCompilationError ? 'Compilation Error' : isRuntimeError ? 'Runtime Error' : isTimeout ? 'Timeout' : 'Error'}
                  {currentError?.line && <span className="text-red-400">at line {currentError.line}</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCompileAndRun} isLoading={running && !submittingQuestion} disabled={isQuestionLocked} leftIcon={<Play size={14} />}>
                Compile & Run
              </Button>
              <div className="w-px h-6 bg-[var(--border)]" />
              {/* Disabled only when the question is locked. Greying these out
                  for empty or untouched code left the candidate with two dead
                  buttons and no reason why — the handlers now say what is
                  missing instead, which is the same call the instructions
                  screen makes about its Start button. */}
              <Button size="sm" variant="outline" onClick={handleSaveQuestion} isLoading={savingQuestion} disabled={isQuestionLocked} leftIcon={<Save size={14} />}>
                Save
              </Button>
              <Button size="sm" variant="primary" onClick={handleSubmitQuestion} isLoading={submittingQuestion} disabled={isQuestionLocked} leftIcon={<Send size={14} />}>
                Submit Q{currentIndex + 1}
              </Button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            {isQuestionLocked && (
              <div className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/70 text-white text-sm">
                  <Lock size={16} />
                  <span>Question submitted — code is locked</span>
                </div>
              </div>
            )}
            <Editor
              height="100%"
              language={MONACO_LANG_MAP[language] || language}
              value={code}
              onChange={(val) => { if (!isQuestionLocked) setCode(val ?? ''); }}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                tabSize: 4,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: isQuestionLocked,
                glyphMargin: true,
              }}
            />
          </div>

          {/* Drag Handle */}
          <div className="flex-shrink-0 h-2 bg-[#2d2d2d] cursor-row-resize flex items-center justify-center hover:bg-[#3d3d3d] transition-colors" onMouseDown={handleDragStart}>
            <GripHorizontal size={14} className="text-gray-500" />
          </div>

          {/* Output Panel */}
          <div className="flex-shrink-0 border-t border-[#333] bg-[#1e1e1e] overflow-hidden flex flex-col" style={{ height: outputHeight }}>
            {/* Tabs */}
            <div className="flex items-center border-b border-[#333] bg-[#252526] px-2">
              <button
                onClick={() => setActiveOutputTab('output')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeOutputTab === 'output' ? 'border-[var(--primary)] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Terminal size={14} />
                Output
                {/* Driven by status, not `passed` — an ungraded run reports
                    passed: null, and reading that as false marked a clean run
                    as a failure. */}
                {compilerResponse && ranCleanly(compilerResponse) && (
                  <CheckCircle size={12} className="text-green-400" />
                )}
                {compilerResponse && hasError && <XCircle size={12} className="text-red-400" />}
              </button>
              <button
                onClick={() => setActiveOutputTab('input')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeOutputTab === 'input' ? 'border-[var(--primary)] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                Custom Input
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeOutputTab === 'input' ? (
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter custom input here..."
                  className="w-full h-full bg-transparent text-sm font-mono text-gray-300 placeholder-gray-600 resize-none outline-none"
                  disabled={isQuestionLocked}
                />
              ) : !compilerResponse ? (
                <p className="text-sm text-gray-500 font-mono">Run your code to see the output here.</p>
              ) : (
                <div className="space-y-3">
                  {/* Compilation Error */}
                  {hasError && isCompilationError && (
                    <div className="p-3 rounded-lg border border-red-800/50 bg-red-950/50">
                      <div className="flex items-center gap-2 mb-2 text-red-400">
                        <XCircle size={16} />
                        <span className="text-sm font-semibold">Compilation Error</span>
                        {currentError?.line && (
                          <span className="text-xs bg-red-900/50 px-2 py-0.5 rounded-full">Line {currentError.line}</span>
                        )}
                      </div>
                      <pre className="text-sm font-mono whitespace-pre-wrap text-red-300">{currentError?.message}</pre>
                      {currentError?.fullTrace && currentError.fullTrace !== currentError.message && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-500 cursor-pointer hover:text-red-400">Full trace</summary>
                          <pre className="mt-1 text-xs font-mono whitespace-pre-wrap text-red-400/80">{currentError.fullTrace}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Runtime Error */}
                  {hasError && isRuntimeError && (
                    <div className="p-3 rounded-lg border border-orange-800/50 bg-orange-950/50">
                      <div className="flex items-center gap-2 mb-2 text-orange-400">
                        <AlertOctagon size={16} />
                        <span className="text-sm font-semibold">Runtime Error</span>
                        {currentError?.line && (
                          <span className="text-xs bg-orange-900/50 px-2 py-0.5 rounded-full">Line {currentError.line}</span>
                        )}
                      </div>
                      <pre className="text-sm font-mono whitespace-pre-wrap text-orange-300">{currentError?.message}</pre>
                      {currentError?.fullTrace && currentError.fullTrace !== currentError.message && (
                        <details className="mt-2">
                          <summary className="text-xs text-orange-500 cursor-pointer hover:text-orange-400">Stack trace</summary>
                          <pre className="mt-1 text-xs font-mono whitespace-pre-wrap text-orange-400/80">{currentError.fullTrace}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Timeout */}
                  {hasError && isTimeout && (
                    <div className="p-3 rounded-lg border border-amber-800/50 bg-amber-950/50">
                      <div className="flex items-center gap-2 mb-2 text-amber-400">
                        <TimerOff size={16} />
                        <span className="text-sm font-semibold">Time Limit Exceeded</span>
                      </div>
                      <p className="text-sm font-mono text-amber-300">Your code exceeded the time limit. Optimize your solution and try again.</p>
                    </div>
                  )}

                  {/* Plain output — an ungraded run, so there is nothing to
                      compare and no pass/fail to report. */}
                  {!hasError && compilerResponse.testResults?.length > 0 && !isGraded(compilerResponse.testResults[0]) && (
                    <pre className="text-sm font-mono whitespace-pre-wrap text-green-400">
                      {compilerResponse.testResults[0].actualOutput || 'No output'}
                    </pre>
                  )}

                  {/* Test case results */}
                  {compilerResponse.testResults?.some(isGraded) && !hasError && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-400">Test Results</h4>
                        {/* Explicit true/false — `passed` is null on ungraded
                            runs, which a truthiness test reads as "Some Failed". */}
                        {compilerResponse.passed === true && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-900/50 text-green-400">
                            All Passed
                          </span>
                        )}
                        {compilerResponse.passed === false && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-900/50 text-red-400">
                            Some Failed
                          </span>
                        )}
                      </div>
                      {compilerResponse.testResults.filter(isGraded).map((tr, idx) => (
                        <div
                          key={`${tr.questionId ?? 'case'}-${idx}`}
                          className={`p-3 rounded-lg border ${
                            isPassed(tr) ? 'border-green-800/50 bg-green-950/30' : 'border-red-800/50 bg-red-950/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {isPassed(tr)
                              ? <CheckCircle className="w-4 h-4 text-green-400" />
                              : <XCircle className="w-4 h-4 text-red-400" />}
                            <span className={`text-sm font-medium ${isPassed(tr) ? 'text-green-400' : 'text-red-400'}`}>
                              Test {idx + 1}
                            </span>
                            {/* A timeout, a crash and a wrong answer are
                                different problems — badge them differently. */}
                            {tr.status && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusTone(tr.status)}`}>
                                {statusLabel(tr.status)}
                              </span>
                            )}
                            {tr.errorInfo?.line != null && (
                              <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                                Line {tr.errorInfo.line}
                              </span>
                            )}
                          </div>
                          {!isPassed(tr) && (
                            <div className="mt-2 space-y-1 pl-6">
                              <div className="flex gap-2 text-xs font-mono">
                                <span className="text-gray-500 w-20 shrink-0">Input:</span>
                                <span className="text-gray-400">{tr.input}</span>
                              </div>
                              <div className="flex gap-2 text-xs font-mono">
                                <span className="text-gray-500 w-20 shrink-0">Expected:</span>
                                <span className="text-green-300">{tr.expectedOutput}</span>
                              </div>
                              <div className="flex gap-2 text-xs font-mono">
                                <span className="text-gray-500 w-20 shrink-0">Got:</span>
                                <span className="text-red-300">{tr.actualOutput}</span>
                              </div>
                              {tr.errorInfo && (
                                <div className="mt-1 space-y-1">
                                  <div className="text-xs text-red-400 font-mono">
                                    {errorKind(tr.errorInfo)}: {tr.errorInfo.message}
                                  </div>
                                  {tr.errorInfo.hint && (
                                    <p className="text-xs text-amber-300 flex items-start gap-1.5">
                                      <Lightbulb size={12} className="mt-0.5 flex-shrink-0" />
                                      {tr.errorInfo.hint}
                                    </p>
                                  )}
                                  {tr.errorInfo.fullTrace &&
                                    tr.errorInfo.fullTrace !== tr.errorInfo.message && (
                                      <details>
                                        <summary className="text-xs text-red-500 cursor-pointer hover:text-red-400">
                                          Details
                                        </summary>
                                        <pre className="mt-1 text-xs font-mono whitespace-pre-wrap text-red-400/80">
                                          {tr.errorInfo.fullTrace}
                                        </pre>
                                      </details>
                                    )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Submit Exam Modal ────────────────────────────────────── */}
      <Modal
        isOpen={showConfirmSubmit}
        onClose={() => setShowConfirmSubmit(false)}
        title="Submit Coding Exam"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirmSubmit(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmitExam} isLoading={submitting}>Confirm Submit</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[var(--textSecondary)]">
            Are you sure you want to submit your coding exam? This action cannot be undone.
          </p>
          <div className="p-3 rounded-lg bg-[var(--surface1)] space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--textSecondary)]">Submitted:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">{submittedCount} / {questions.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--textSecondary)]">Saved (draft):</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">{savedCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--textSecondary)]">Not attempted:</span>
              <span className="font-semibold text-[var(--text)]">
                {questions.length - submittedCount - savedCount - Object.values(questionStatus).filter((s) => s === 'in_progress').length}
              </span>
            </div>
          </div>
          <div className="w-full bg-[var(--surface2)] rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(submittedCount / questions.length) * 100}%` }} />
          </div>
          {!allSubmitted && (
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm">Not all questions have been individually submitted. Unsaved code will still be included in the final submission.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
