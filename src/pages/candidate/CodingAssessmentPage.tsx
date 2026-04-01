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
  Maximize,
  ShieldAlert,
  AlertOctagon,
  TimerOff,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  Code2,
  Lock,
  FileWarning,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import { useTimer } from '@/hooks/useTimer';
import { useFullscreen } from '@/hooks/useFullscreen';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { APP_CONFIG } from '@/config/app.config';
import { ROUTES } from '@/config/routes';
import { formatTimer } from '@/utils/format.utils';
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

const LANGUAGE_SKELETONS: Record<string, string> = {
  java: `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here

        sc.close();
    }
}
`,
  python: `def solve():
    # Write your solution here
    pass

if __name__ == "__main__":
    solve()
`,
  c: `#include <stdio.h>

int main() {
    // Write your solution here

    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}
`,
  javascript: `const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    // Write your solution here
});
`,
};

function isSkeletonCode(code: string): boolean {
  return Object.values(LANGUAGE_SKELETONS).some(
    (skeleton) => code.trim() === skeleton.trim()
  );
}

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

  const assessment = (location.state as { assessment?: Assessment })?.assessment;

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
  const [tabWarnings, setTabWarnings] = useState(0);
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

  // Refs
  const isSubmittingRef = useRef(false);
  const initRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // ── Timer ──────────────────────────────────────────────────────────
  const { secondsLeft, start: startTimer } = useTimer({
    initialSeconds: APP_CONFIG.EXAM_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => handleAutoSubmit('Time is up!'),
  });

  // ── Proctoring hooks ──────────────────────────────────────────────
  const { isFullscreen, enterFullscreen, exitFullscreen, fullscreenExitCount } = useFullscreen({
    onExitAttempt: (count) => {
      showToast(`Warning: Fullscreen exited! (${count})`, 'warning');
    },
  });

  usePageVisibility({
    onHidden: () => {
      setTabWarnings((prev) => {
        const next = prev + 1;
        showToast(`Warning: Tab switch detected! (${next})`, 'warning');
        return next;
      });
    },
  });

  const { loadModels, startDetection, stopDetection, warningCount, faceDetected } =
    useFaceDetection({
      maxWarnings: APP_CONFIG.FACE_DETECTION_MAX_WARNINGS,
      onMaxWarnings: () => handleAutoSubmit('Face not detected too many times.'),
      onNoFace: () => {
        showToast('Warning: Your face is not detected!', 'warning');
      },
    });

  const totalWarnings = tabWarnings + warningCount + fullscreenExitCount;
  const maxWarnings = APP_CONFIG.PROCTORING_MAX_TOTAL_WARNINGS;

  useEffect(() => {
    if (totalWarnings >= maxWarnings && !isSubmittingRef.current && !loading) {
      handleAutoSubmit('Too many proctoring warnings.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalWarnings]);

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

    const isCompilation = errorInfo.type?.toLowerCase().includes('compilation') ||
                          errorInfo.type?.toLowerCase().includes('syntax');

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
          type: 'RuntimeError',
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

      showToast('Coding exam submitted successfully!', 'success');
      await exitFullscreen();
      navigate(ROUTES.CANDIDATE.RESULTS);
    } catch {
      // Error toast auto-handled
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, user?.email, currentIndex, code, language]);

  const handleAutoSubmit = useCallback(
    (reason: string) => {
      if (isSubmittingRef.current) return;
      showToast(`Auto-submitting: ${reason}`, 'error');
      handleSubmitExam();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSubmitExam]
  );

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

        await enterFullscreen();

        try {
          await loadModels();
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => startDetection(videoRef.current!);
          }
        } catch (camErr) {
          console.warn('Face detection/camera unavailable:', camErr);
        }

        if (user?.email) {
          await assessmentService.markAttended({
            assessmentId: assessment.id,
            candidateEmail: user.email,
          });
        }

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

  useEffect(() => {
    return () => {
      stopDetection();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
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
    setLanguage(newLanguage);
    if (code.trim() === '' || isSkeletonCode(code)) {
      setCode(LANGUAGE_SKELETONS[newLanguage] || `// Write your ${newLanguage} code here\n`);
    }
    const currentQ = questions[currentIndex];
    if (currentQ) {
      setLangPerQuestion((prev) => ({ ...prev, [currentQ.id]: newLanguage }));
    }
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

  // ── Compile & Run ────────────────────────────────────────────────
  const handleCompileAndRun = async () => {
    const currentQ = questions[currentIndex];
    setRunning(true);
    setCompilerResponse(null);
    setCurrentError(null);
    clearEditorMarkers();
    setActiveOutputTab('output');
    try {
      const hasTests = (currentQ?.testCases?.length ?? 0) > 0;
      const res = await compilerService.runCode({
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
      });
      processCompilerResponse(res.data);
    } catch {
      // Error toast auto-handled
    } finally {
      setRunning(false);
    }
  };

  // ── Save question (draft) ────────────────────────────────────────
  const handleSaveQuestion = async () => {
    const currentQ = questions[currentIndex];
    if (!currentQ || !assessment || !user?.email) return;

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
      showToast(`Question ${currentIndex + 1} saved!`, 'success');
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
      showToast(`Question ${currentIndex + 1} submitted!`, 'success');
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
  const isCompilationError = currentError?.type?.toLowerCase().includes('compilation') ||
                             currentError?.type?.toLowerCase().includes('syntax');
  const isRuntimeError = currentError?.type?.toLowerCase().includes('runtime');
  const isTimeout = currentError?.type?.toLowerCase().includes('timeout');

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Fullscreen overlay */}
      {!isFullscreen && !loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center p-8 rounded-2xl bg-[var(--cardBg)] border border-[var(--border)] max-w-md mx-4 shadow-2xl">
            <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">Fullscreen Required</h2>
            <p className="text-[var(--textSecondary)] mb-6">
              You must remain in fullscreen mode during the exam. Exiting fullscreen is recorded as a warning.
            </p>
            <Button onClick={enterFullscreen} leftIcon={<Maximize size={16} />}>
              Return to Fullscreen
            </Button>
          </div>
        </div>
      )}

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[var(--cardBg)] border-b border-[var(--border)] px-4 py-2">
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
            <div className="w-16 h-12 bg-black rounded overflow-hidden flex-shrink-0">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>

            {!faceDetected && (
              <div className="flex items-center gap-1 text-amber-500 animate-pulse">
                <EyeOff size={14} />
                <span className="text-xs font-medium">No face</span>
              </div>
            )}

            <div className="relative group">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${warningColor}`}>
                <AlertTriangle size={12} />
                <span>{totalWarnings}/{maxWarnings}</span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-48 p-2.5 rounded-lg bg-[var(--cardBg)] border border-[var(--border)] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-20">
                <p className="text-xs font-semibold text-[var(--text)] mb-1.5">Warnings</p>
                <div className="space-y-0.5 text-xs text-[var(--textSecondary)]">
                  <p>Tab switches: {tabWarnings}</p>
                  <p>Face detection: {warningCount}</p>
                  <p>Fullscreen exits: {fullscreenExitCount}</p>
                </div>
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
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Question Description */}
        <div className="w-[38%] border-r border-[var(--border)] overflow-y-auto flex flex-col">
          {currentQuestion && (
            <div className="flex-1 p-5 space-y-4">
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

        {/* Right: Editor + Output */}
        <div className="flex-1 flex flex-col" ref={containerRef}>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--cardBg)] border-b border-[var(--border)]">
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
              <Button size="sm" variant="outline" onClick={handleSaveQuestion} isLoading={savingQuestion} disabled={isQuestionLocked || !code.trim() || isSkeletonCode(code)} leftIcon={<Save size={14} />}>
                Save
              </Button>
              <Button size="sm" variant="primary" onClick={handleSubmitQuestion} isLoading={submittingQuestion} disabled={isQuestionLocked || !code.trim() || isSkeletonCode(code)} leftIcon={<Send size={14} />}>
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
          <div className="h-2 bg-[#2d2d2d] cursor-row-resize flex items-center justify-center hover:bg-[#3d3d3d] transition-colors" onMouseDown={handleDragStart}>
            <GripHorizontal size={14} className="text-gray-500" />
          </div>

          {/* Output Panel */}
          <div className="border-t border-[#333] bg-[#1e1e1e] overflow-hidden flex flex-col" style={{ height: outputHeight }}>
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
                {compilerResponse?.passed === true && <CheckCircle size={12} className="text-green-400" />}
                {compilerResponse?.passed === false && hasError && <XCircle size={12} className="text-red-400" />}
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

                  {/* Success output (no test cases) */}
                  {!hasError && compilerResponse.testResults?.length > 0 && !compilerResponse.testResults[0].expectedOutput && (
                    <pre className="text-sm font-mono whitespace-pre-wrap text-green-400">
                      {compilerResponse.testResults[0].actualOutput || 'No output'}
                    </pre>
                  )}

                  {/* Test case results */}
                  {compilerResponse.testResults?.some((tr) => tr.expectedOutput) && !hasError && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-400">Test Results</h4>
                        {compilerResponse.passed !== undefined && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            compilerResponse.passed ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                          }`}>
                            {compilerResponse.passed ? 'All Passed' : 'Some Failed'}
                          </span>
                        )}
                      </div>
                      {compilerResponse.testResults.filter((tr) => tr.expectedOutput).map((tr, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${
                            tr.passed ? 'border-green-800/50 bg-green-950/30' : 'border-red-800/50 bg-red-950/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {tr.passed ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                            <span className={`text-sm font-medium ${tr.passed ? 'text-green-400' : 'text-red-400'}`}>
                              Test {idx + 1}: {tr.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          {!tr.passed && (
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
                                <div className="mt-1 text-xs text-red-400 font-mono">
                                  {tr.errorInfo.type}: {tr.errorInfo.message}
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
