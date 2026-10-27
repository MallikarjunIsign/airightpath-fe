import { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ChevronLeft, ChevronRight, Clock, Info, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { TestModeBanner } from '@/components/testmode/TestModeBanner';
import { TestModeStepper } from '@/components/testmode/TestModeStepper';
import { InstructionsPreview } from '@/components/testmode/InstructionsPreview';
import { DeviceCheckPreview } from '@/components/testmode/DeviceCheckPreview';
import {
  QuestionSourcePicker,
  PaperSourceBadge,
  type LoadedPaper,
} from '@/components/testmode/QuestionSourcePicker';
import { CodingResultPreview } from '@/components/testmode/CodingResultPreview';
import { useTimer } from '@/hooks/useTimer';
import { computeExamMinutes } from '@/utils/exam-duration.utils';
import { normalizeCodingQuestions } from '@/utils/exam-question.utils';
import { formatTimer } from '@/utils/format.utils';
import { LANGUAGE_SKELETONS, isSkeletonCode } from '@/utils/code.utils';
import type { CodingQuestion, RawCodingQuestion } from '@/types/assessment.types';

type Stage = 'setup' | 'instructions' | 'check' | 'exam' | 'result';

const STAGES: readonly { id: Stage; label: string }[] = [
  { id: 'setup', label: 'Paper' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'check', label: 'Device check' },
  { id: 'exam', label: 'Exam' },
  { id: 'result', label: 'Result' },
];

/** Same set the real coding exam offers, in the same order. */
const LANGUAGE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'javascript', label: 'JavaScript' },
];

/** Monaco's id for a language differs from ours in one case. */
function monacoLanguage(language: string): string {
  return language === 'cpp' ? 'cpp' : language;
}

/**
 * Coding, rehearsed end to end — with one deliberate omission.
 *
 * Run is absent rather than disabled-with-a-tooltip. Executing code means
 * `POST /api/compiler/run`, which writes submission rows, and a rehearsal that
 * leaves real submissions behind would defeat the point of Test Mode. So this
 * covers everything up to the moment of execution: the problem statements, the
 * visible test cases, the editor, the language switch, per-problem code
 * retention and the clock. That is the part admins actually need to check —
 * whether a paper reads properly and fits in its time — and it is stated on
 * screen so nobody assumes the compiler was exercised.
 */
export function TestModeCodingPage() {
  const [stage, setStage] = useState<Stage>('setup');
  const [visited, setVisited] = useState<Stage[]>(['setup']);
  const [paper, setPaper] = useState<LoadedPaper | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [language, setLanguage] = useState('java');
  /** Code per problem id, exactly as the real exam retains it. */
  const [codeByQuestion, setCodeByQuestion] = useState<Record<number, string>>({});
  const [checkReady, setCheckReady] = useState(false);
  const [endReason, setEndReason] = useState<'submitted' | 'time-expired'>('submitted');

  const durationMinutes = useMemo(
    () => computeExamMinutes({ type: 'CODING', questionCount: questions.length }),
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
      const normalized = normalizeCodingQuestions(loaded.questions as RawCodingQuestion[]);
      setPaper(loaded);
      setQuestions(normalized);
      setCodeByQuestion({});
      setCurrentIndex(0);
      goTo('instructions');
    },
    [goTo],
  );

  const reset = useCallback(() => {
    timer.reset(0);
    setPaper(null);
    setQuestions([]);
    setCodeByQuestion({});
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

  const current = questions[currentIndex];
  const currentCode = current
    ? (codeByQuestion[current.id] ?? LANGUAGE_SKELETONS[language] ?? '')
    : '';

  const setCurrentCode = useCallback(
    (value: string | undefined) => {
      if (!current) return;
      setCodeByQuestion((prev) => ({ ...prev, [current.id]: value ?? '' }));
    },
    [current],
  );

  // Switching language rewrites only untouched problems, so a candidate who has
  // started typing never loses work to a dropdown — the real exam's rule.
  const handleLanguageChange = useCallback(
    (next: string) => {
      setLanguage(next);
      if (!current) return;
      const existing = codeByQuestion[current.id];
      if (existing === undefined || isSkeletonCode(existing)) {
        setCodeByQuestion((prev) => ({ ...prev, [current.id]: LANGUAGE_SKELETONS[next] ?? '' }));
      }
    },
    [codeByQuestion, current],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Test Mode — Coding</h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          Read a coding paper the way a candidate meets it, in the editor they type into.
        </p>
      </div>

      <TestModeBanner title="Coding" onReset={reset} />

      <TestModeStepper stages={STAGES} current={stage} reachable={visited} onSelect={goTo} />

      {paper && stage !== 'setup' && <PaperSourceBadge paper={paper} />}

      {stage === 'setup' && <QuestionSourcePicker kind="coding" onLoaded={handleLoaded} />}

      {stage === 'instructions' && (
        <>
          <InstructionsPreview
            kind="coding"
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
            {!checkReady && (
              <p className="text-sm text-[var(--textSecondary)]">
                A candidate cannot start until the photo is taken. Test Mode lets you through
                anyway.
              </p>
            )}
          </div>
        </>
      )}

      {stage === 'exam' && current && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                Problem {currentIndex + 1} of {questions.length}
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
            <div className="flex flex-col gap-6 xl:flex-row">
              {/* Statement and test cases. */}
              <div className="min-w-0 xl:w-2/5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-[var(--text)]">{current.title}</h3>
                  {current.marks ? (
                    <Badge variant="secondary" size="sm">
                      {current.marks} mark{current.marks > 1 ? 's' : ''}
                    </Badge>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--textSecondary)]">
                  {current.description}
                </p>

                {(current.sampleInput || current.sampleOutput) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {current.sampleInput && (
                      <Snippet label="Sample input" body={current.sampleInput} />
                    )}
                    {current.sampleOutput && (
                      <Snippet label="Sample output" body={current.sampleOutput} />
                    )}
                  </div>
                )}

                {current.testCases && current.testCases.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-medium text-[var(--textSecondary)]">
                      Test cases ({current.testCases.length})
                    </p>
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {current.testCases.map((testCase, index) => (
                        <div
                          key={`${current.id}-${index}`}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface1)] p-2 text-xs"
                        >
                          <p className="font-mono break-all text-[var(--text)]">
                            <span className="text-[var(--textTertiary)]">in </span>
                            {testCase.input}
                          </p>
                          <p className="font-mono break-all text-[var(--text)]">
                            <span className="text-[var(--textTertiary)]">out </span>
                            {testCase.expectedOutput}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Editor. */}
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="w-40">
                    <Select
                      options={LANGUAGE_OPTIONS}
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      aria-label="Language"
                    />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-[var(--textTertiary)]">
                    <Info size={12} />
                    Running code is disabled in Test Mode
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <Editor
                    height="26rem"
                    language={monacoLanguage(language)}
                    value={currentCode}
                    onChange={setCurrentCode}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between">
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'result' && (
        <CodingResultPreview
          questions={questions}
          codeByQuestion={codeByQuestion}
          language={language}
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

function Snippet({ label, body }: Readonly<{ label: string; body: string }>) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--textSecondary)]">{label}</p>
      <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface1)] p-2 text-xs text-[var(--text)]">
        {body}
      </pre>
    </div>
  );
}
