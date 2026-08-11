import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Send,
  Loader2,
  EyeOff,
  Camera,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { assessmentService } from '@/services/assessment.service';
import { useTimer } from '@/hooks/useTimer';
import { useExamProctoring } from '@/hooks/useExamProctoring';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { APP_CONFIG } from '@/config/app.config';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import { MESSAGES } from '@/config/messages';
import { CameraRequiredOverlay, FullscreenRequiredOverlay } from '@/components/exam/ExamOverlays';
import { ROUTES } from '@/config/routes';
import { formatTimer } from '@/utils/format.utils';
import { computeExamMinutes } from '@/utils/exam-duration.utils';
import type { Assessment, Question, RawQuestion } from '@/types/assessment.types';

/** Normalise raw BE question (object options, "question" field) → clean UI shape */
function normalizeQuestions(raw: RawQuestion[]): Question[] {
  return raw.map((q, idx) => {
    // Options: BE sends {"A":"text","B":"text"} or legacy ["text","text"]
    let options: { key: string; text: string }[];
    if (Array.isArray(q.options)) {
      options = q.options.map((text, i) => ({
        key: String.fromCharCode(65 + i),
        text: String(text),
      }));
    } else if (q.options && typeof q.options === 'object') {
      options = Object.entries(q.options).map(([key, text]) => ({
        key,
        text: String(text),
      }));
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

export function AptitudeAssessmentPage() {
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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const isSubmittingRef = useRef(false);
  const initRef = useRef(false);
  const proctoring = PROCTORING_CONFIG;

  // Latest auto-submit handler, wired to the proctoring hook (defined below).
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

  // Refs for stable access in callbacks
  const questionsRef = useRef<Question[]>([]);
  const answersRef = useRef<Record<number, string>>({});
  questionsRef.current = questions;
  answersRef.current = answers;

  // Timer. The real duration is per-question, so it is only known once the
  // paper has loaded — init below resets the clock to it before starting.
  const { secondsLeft, start: startTimer, reset: resetTimer } = useTimer({
    initialSeconds: APP_CONFIG.EXAM_TIMER_MINUTES * 60,
    autoStart: false,
    onExpire: () => handleAutoSubmit('Time is up!'),
  });

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setShowConfirmSubmit(false);
    stopDetection();
    markInactive();

    try {
      if (!assessment || !user?.email) return;

      const currentQuestions = questionsRef.current;
      const currentAnswers = answersRef.current;

      let score = 0;
      const resultDetails = currentQuestions.map((q) => {
        const selectedAnswer = currentAnswers[q.id] || '';
        const isCorrect = selectedAnswer === q.correctAnswer;
        if (isCorrect) score += q.marks || 1;
        return {
          questionId: q.id,
          questionText: q.questionText,
          selectedAnswer,
          correctAnswer: q.correctAnswer || '',
          isCorrect,
          marks: isCorrect ? (q.marks || 1) : 0,
        };
      });

      await assessmentService.saveResult({
        candidateEmail: user.email,
        assessmentType: assessment.assessmentType,
        score,
        resultsJson: JSON.stringify(resultDetails),
        jobPrefix: assessment.jobPrefix,
      });

      showToast(MESSAGES.exam.aptitudeSubmitted, 'success');
      await exitFullscreen();
      navigate(ROUTES.CANDIDATE.RESULTS);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
      // Submit failed (or was skipped) — the exam continues, so re-arm the
      // counters and the reload prompt. Harmless on the success path: the
      // redirect to results has already unmounted this page.
      markActive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, user?.email]);

  const handleAutoSubmit = useCallback(
    (reason: string) => {
      if (isSubmittingRef.current) return;
      showToast(MESSAGES.proctoring.autoSubmitting(reason), 'error');
      handleSubmit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSubmit]
  );

  // Keep the proctoring hook's auto-submit pointing at the latest handler.
  useEffect(() => {
    autoSubmitRef.current = handleAutoSubmit;
  });

  // Fetch questions and start exam
  useEffect(() => {
    async function initExam() {
      if (!assessment?.id || initRef.current) return;
      initRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await assessmentService.fetchQuestions(assessment.id);
        const raw = res.data.questions;

        let parsed: RawQuestion[];
        if (!raw) {
          throw new Error('No questions found for this assessment.');
        } else if (typeof raw === 'string') {
          parsed = JSON.parse(raw);
        } else {
          parsed = raw as unknown as RawQuestion[];
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('No questions found for this assessment.');
        }

        setQuestions(normalizeQuestions(parsed));

        // Now that the paper is counted, set the clock: per-question time x
        // questions, unless the instructions screen already fixed a duration.
        const minutes = computeExamMinutes({
          type: assessment.assessmentType,
          questionCount: parsed.length,
          minutesPerQuestion: assessment.minutesPerQuestion,
          durationMinutes: agreedDurationMinutes ?? assessment.durationMinutes,
        });
        resetTimer(minutes * 60);

        // Proctoring init: fullscreen → face models → camera (config-driven).
        await beginProctoring();

        // Mark assessment as attended
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
        const message = err instanceof Error ? err.message : 'Failed to load exam questions.';
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    initExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswerSelect = (questionId: number, answerKey: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answerKey }));
  };

  // Warning pill color
  const warningColor =
    totalWarnings === 0
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      : totalWarnings <= 3
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';

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
          <p className="text-[var(--text)] font-medium">Loading exam questions...</p>
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
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Camera Required Overlay — blocks the exam until the camera is live */}
      {proctoring.camera.required &&
        !loading &&
        (camera.status === 'denied' ||
          camera.status === 'unavailable' ||
          camera.status === 'error') && (
          <CameraRequiredOverlay message={camera.message} onRetry={setupCamera} />
        )}

      {/* Fullscreen Exit Overlay */}
      {proctoring.fullscreen.enabled && !isFullscreen && !loading && (
        <FullscreenRequiredOverlay onReturn={enterFullscreen} />
      )}

      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-[var(--cardBg)] border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Badge variant="info">{assessment.assessmentType}</Badge>
            <span className="text-sm text-[var(--textSecondary)]">{assessment.jobPrefix}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Face detection warning */}
            {!faceDetected && (
              <div className="flex items-center gap-1 text-amber-500 animate-pulse">
                <EyeOff size={16} />
                <span className="text-sm font-medium">Face not detected</span>
              </div>
            )}
            {multipleFaces && (
              <div className="flex items-center gap-1 text-red-500 animate-pulse">
                <Users size={16} />
                <span className="text-sm font-medium">Multiple faces detected</span>
              </div>
            )}

            {/* Consolidated warning pill */}
            <div className="relative group">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${warningColor}`}>
                <AlertTriangle size={14} />
                <span>{totalWarnings} warning{totalWarnings === 1 ? '' : 's'}</span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg bg-[var(--cardBg)] border border-[var(--border)] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-20">
                <p className="text-xs font-semibold text-[var(--text)] mb-2">Warning Breakdown</p>
                <div className="space-y-1 text-xs text-[var(--textSecondary)]">
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
                <p className="mt-2 text-[11px] text-[var(--textSecondary)] border-t border-[var(--border)] pt-2">
                  Reaching a limit auto-submits your exam. Do not reload this page — the
                  exam restarts from the beginning.
                </p>
              </div>
            </div>

            {/* Timer */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${
                secondsLeft <= 300
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-[var(--surface1)] text-[var(--text)]'
              }`}
            >
              <Clock size={16} />
              {formatTimer(secondsLeft)}
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowConfirmSubmit(true)}
              leftIcon={<Send size={14} />}
            >
              Submit
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 max-w-7xl mx-auto w-full">
        {/* Question Navigation Sidebar */}
        <div className="w-64 border-r border-[var(--border)] bg-[var(--cardBg)] p-4 overflow-y-auto">
          {/* Camera Preview */}
          <div className="mb-4">
            <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {camera.status !== 'active' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-2 text-center">
                  <Camera size={20} className="text-white/60" />
                  <span className="text-[11px] leading-tight text-white/80">
                    {camera.status === 'requesting' ? 'Starting camera…' : 'Camera off'}
                  </span>
                  {(camera.status === 'denied' ||
                    camera.status === 'unavailable' ||
                    camera.status === 'error') && (
                    <button
                      onClick={setupCamera}
                      className="mt-1 rounded-md bg-white/15 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/25"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs">
              <Camera
                size={12}
                className={camera.status === 'active' ? 'text-green-500' : 'text-red-500'}
              />
              <span
                className={
                  camera.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                }
              >
                {camera.status === 'active' ? 'Camera active' : 'Camera not active'}
              </span>
            </div>
          </div>

          <p className="text-sm font-medium text-[var(--textSecondary)] mb-3">
            Questions ({answeredCount}/{questions.length} answered)
          </p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, index) => {
              const isAnswered = !!answers[q.id];
              const isCurrent = index === currentIndex;

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`
                    w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200
                    ${
                      isCurrent
                        ? 'bg-[var(--primary)] text-white ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--cardBg)]'
                        : isAnswered
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700'
                          : 'bg-[var(--surface1)] text-[var(--textSecondary)] border border-[var(--border)] hover:border-[var(--primary)]'
                    }
                  `}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {currentQuestion && (
            <div className="max-w-3xl">
              {/* Question Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Question {currentIndex + 1} of {questions.length}
                </h2>
                {currentQuestion.marks && (
                  <Badge variant="secondary" size="sm">
                    {currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {/* Question Text */}
              <Card>
                <CardContent>
                  <p className="text-[var(--text)] text-lg leading-relaxed whitespace-pre-wrap">
                    {currentQuestion.questionText}
                  </p>
                </CardContent>
              </Card>

              {/* Options */}
              <div className="mt-6 space-y-3">
                {currentQuestion.options.map((opt) => {
                  const isSelected = answers[currentQuestion.id] === opt.key;

                  return (
                    <label
                      key={opt.key}
                      className={`
                        flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                        ${
                          isSelected
                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--border)] hover:border-[var(--primary)]/50 bg-[var(--cardBg)]'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={opt.key}
                        checked={isSelected}
                        onChange={() => handleAnswerSelect(currentQuestion.id, opt.key)}
                        className="sr-only"
                      />
                      <span
                        className={`
                          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                          ${
                            isSelected
                              ? 'bg-[var(--primary)] text-white'
                              : 'bg-[var(--surface2)] text-[var(--textSecondary)]'
                          }
                        `}
                      >
                        {opt.key}
                      </span>
                      <span className="text-[var(--text)]">{opt.text}</span>
                    </label>
                  );
                })}
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between mt-8">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  leftIcon={<ChevronLeft size={18} />}
                >
                  Previous
                </Button>
                <Button
                  onClick={() =>
                    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                  }
                  disabled={currentIndex === questions.length - 1}
                  rightIcon={<ChevronRight size={18} />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Submit Modal */}
      <Modal
        isOpen={showConfirmSubmit}
        onClose={() => setShowConfirmSubmit(false)}
        title="Submit Exam"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} isLoading={submitting}>
              Confirm Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[var(--textSecondary)]">
            Are you sure you want to submit your exam?
          </p>
          <div className="p-3 rounded-lg bg-[var(--surface1)]">
            <p className="text-sm text-[var(--text)]">
              Answered: <strong>{answeredCount}</strong> / {questions.length}
            </p>
            <p className="text-sm text-[var(--text)]">
              Unanswered: <strong>{questions.length - answeredCount}</strong>
            </p>
          </div>
          {questions.length - answeredCount > 0 && (
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                You have {questions.length - answeredCount} unanswered question(s). They will
                be marked as incorrect.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
