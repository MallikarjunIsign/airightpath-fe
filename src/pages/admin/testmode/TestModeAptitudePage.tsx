import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TestModeBanner } from '@/components/testmode/TestModeBanner';
import { TestModeStepper } from '@/components/testmode/TestModeStepper';
import { InstructionsPreview } from '@/components/testmode/InstructionsPreview';
import { DeviceCheckPreview } from '@/components/testmode/DeviceCheckPreview';
import {
  QuestionSourcePicker,
  PaperSourceBadge,
  type LoadedPaper,
} from '@/components/testmode/QuestionSourcePicker';
import { AptitudeResultPreview } from '@/components/testmode/AptitudeResultPreview';
import { useTimer } from '@/hooks/useTimer';
import { computeExamMinutes } from '@/utils/exam-duration.utils';
import { normalizeAptitudeQuestions } from '@/utils/exam-question.utils';
import { formatTimer } from '@/utils/format.utils';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';
import type { Question, RawQuestion } from '@/types/assessment.types';

type Stage = 'setup' | 'instructions' | 'check' | 'exam' | 'result';

const STAGES: readonly { id: Stage; label: string }[] = [
  { id: 'setup', label: 'Paper' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'check', label: 'Device check' },
  { id: 'exam', label: 'Exam' },
  { id: 'result', label: 'Result' },
];

/**
 * Aptitude, rehearsed end to end.
 *
 * Every stage is the candidate's stage: the same rules screen, the same identity
 * capture, the same question layout and palette, the same clock. What is
 * deliberately *not* the same is the lockdown — no fullscreen trap, no
 * auto-submit on tab switch, and the stepper lets you walk backwards. An admin
 * checking a paper should not have to sit through an exam that fights them, and
 * the instructions stage already states which rules the real run enforces.
 *
 * All state is local. There is no persistence of any kind, so a reload is the
 * reset button and no row, upload or session entry outlives the visit.
 */
export function TestModeAptitudePage() {
  const [stage, setStage] = useState<Stage>('setup');
  const [visited, setVisited] = useState<Stage[]>(['setup']);
  const [paper, setPaper] = useState<LoadedPaper | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checkReady, setCheckReady] = useState(false);
  /** Why the run ended — mirrors the reason a real submission records. */
  const [endReason, setEndReason] = useState<'submitted' | 'time-expired'>('submitted');

  const durationMinutes = useMemo(
    () => computeExamMinutes({ type: 'APTITUDE', questionCount: questions.length }),
    [questions.length],
  );

  const goTo = useCallback((next: Stage) => {
    setStage(next);
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
  }, []);

  const finish = useCallback(
    (reason: 'submitted' | 'time-expired') => {
      setEndReason(reason);
      goTo('result');
    },
    [goTo],
  );

  const timer = useTimer({
    initialSeconds: durationMinutes * 60,
    onExpire: () => finish('time-expired'),
  });

  const handleLoaded = useCallback(
    (loaded: LoadedPaper) => {
      setPaper(loaded);
      setQuestions(normalizeAptitudeQuestions(loaded.questions as RawQuestion[]));
      setAnswers({});
      setCurrentIndex(0);
      goTo('instructions');
    },
    [goTo],
  );

  const reset = useCallback(() => {
    timer.reset(0);
    setPaper(null);
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setCheckReady(false);
    setStage('setup');
    setVisited(['setup']);
  }, [timer]);

  const startExam = useCallback(() => {
    timer.reset(durationMinutes * 60);
    timer.start();
    setCurrentIndex(0);
    goTo('exam');
  }, [durationMinutes, goTo, timer]);

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = questions[currentIndex];

  // The device check is skippable here and not in the real flow. Stated on the
  // button rather than silently allowed, so nobody mistakes it for the
  // candidate's experience.
  const photoRequired = PROCTORING_CONFIG.identityPhoto.required;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Test Mode — Aptitude</h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          Load a paper and sit it exactly as a candidate would.
        </p>
      </div>

      <TestModeBanner title="Aptitude" onReset={reset} />

      <TestModeStepper stages={STAGES} current={stage} reachable={visited} onSelect={goTo} />

      {paper && stage !== 'setup' && <PaperSourceBadge paper={paper} />}

      {stage === 'setup' && <QuestionSourcePicker kind="aptitude" onLoaded={handleLoaded} />}

      {stage === 'instructions' && (
        <>
          <InstructionsPreview
            kind="aptitude"
            questionCount={questions.length}
            durationMinutes={durationMinutes}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => goTo('check')}>
              Continue to device check
            </Button>
            <Button variant="outline" onClick={startExam}>
              Skip to the exam
            </Button>
          </div>
        </>
      )}

      {stage === 'check' && (
        <>
          <DeviceCheckPreview onReadyChange={setCheckReady} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={startExam}>
              Start exam
            </Button>
            {photoRequired && !checkReady && (
              <p className="text-sm text-[var(--textSecondary)]">
                A candidate cannot start until the photo is taken. Test Mode lets you through
                anyway.
              </p>
            )}
          </div>
        </>
      )}

      {stage === 'exam' && questions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                Question {currentIndex + 1} of {questions.length}
              </CardTitle>
              <div className="flex items-center gap-3">
                <span
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
                    timer.secondsLeft <= 300
                      ? 'bg-[var(--error)]/10 text-[var(--error)]'
                      : 'bg-[var(--surface1)] text-[var(--text)]'
                  }`}
                >
                  <Clock size={16} />
                  {formatTimer(timer.secondsLeft)}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Send size={14} />}
                  onClick={() => finish('submitted')}
                >
                  Submit
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Palette — the candidate's map of the paper. */}
              <div className="lg:w-56 lg:flex-shrink-0">
                <p className="mb-3 text-sm font-medium text-[var(--textSecondary)]">
                  {answeredCount}/{questions.length} answered
                </p>
                <div className="grid grid-cols-8 gap-2 lg:grid-cols-5">
                  {questions.map((question, index) => {
                    const isAnswered = !!answers[question.id];
                    const isCurrent = index === currentIndex;
                    let tone =
                      'bg-[var(--surface1)] text-[var(--textSecondary)] border border-[var(--border)] hover:border-[var(--primary)]';
                    if (isCurrent) tone = 'bg-[var(--primary)] text-white';
                    else if (isAnswered)
                      tone = 'bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/40';
                    return (
                      <button
                        key={question.id}
                        onClick={() => setCurrentIndex(index)}
                        className={`h-10 w-10 rounded-lg text-sm font-medium transition-all ${tone}`}
                        aria-label={`Question ${index + 1}${isAnswered ? ', answered' : ''}`}
                        aria-current={isCurrent ? 'true' : undefined}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question and options. */}
              <div className="min-w-0 flex-1">
                {currentQuestion && (
                  <>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-lg leading-relaxed text-[var(--text)]">
                        {currentQuestion.questionText}
                      </p>
                      {currentQuestion.marks ? (
                        <Badge variant="secondary" size="sm">
                          {currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      {currentQuestion.options.map((option) => {
                        const isSelected = answers[currentQuestion.id] === option.key;
                        return (
                          <label
                            key={option.key}
                            className={`flex cursor-pointer items-center gap-4 rounded-lg border-2 p-4 transition-all ${
                              isSelected
                                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                                : 'border-[var(--border)] bg-[var(--cardBg)] hover:border-[var(--primary)]/50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`tm-question-${currentQuestion.id}`}
                              value={option.key}
                              checked={isSelected}
                              onChange={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [currentQuestion.id]: option.key,
                                }))
                              }
                              className="sr-only"
                            />
                            <span
                              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                isSelected
                                  ? 'bg-[var(--primary)] text-white'
                                  : 'bg-[var(--surface2)] text-[var(--textSecondary)]'
                              }`}
                            >
                              {option.key}
                            </span>
                            <span className="text-[var(--text)]">{option.text}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-8 flex items-center justify-between">
                      <Button
                        variant="outline"
                        leftIcon={<ChevronLeft size={18} />}
                        disabled={currentIndex === 0}
                        onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      >
                        Previous
                      </Button>
                      {currentIndex === questions.length - 1 ? (
                        <Button
                          variant="primary"
                          rightIcon={<Send size={16} />}
                          onClick={() => finish('submitted')}
                        >
                          Finish
                        </Button>
                      ) : (
                        <Button
                          rightIcon={<ChevronRight size={18} />}
                          onClick={() =>
                            setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                          }
                        >
                          Next
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'result' && (
        <AptitudeResultPreview
          questions={questions}
          answers={answers}
          endReason={endReason}
          secondsLeft={timer.secondsLeft}
          durationMinutes={durationMinutes}
          onRetake={startExam}
          onReset={reset}
        />
      )}
    </div>
  );
}
