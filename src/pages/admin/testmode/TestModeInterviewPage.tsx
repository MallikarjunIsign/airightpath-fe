import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Clock, Info, MessageSquare, Send, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { TestModeBanner } from '@/components/testmode/TestModeBanner';
import { TestModeStepper } from '@/components/testmode/TestModeStepper';
import { DeviceCheckPreview } from '@/components/testmode/DeviceCheckPreview';
import { useTimer } from '@/hooks/useTimer';
import { formatTimer } from '@/utils/format.utils';
import {
  INTERVIEW_SCRIPTS,
  INTERVIEW_SCRIPT_NOTICE,
  type InterviewPhaseId,
} from '@/config/test-mode-interview';

type Stage = 'brief' | 'check' | 'interview' | 'transcript';

const STAGES: readonly { id: Stage; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'check', label: 'Device check' },
  { id: 'interview', label: 'Interview' },
  { id: 'transcript', label: 'Transcript' },
];

interface Turn {
  question: string;
  answer: string;
}

/**
 * One phase of the AI interview, rehearsed.
 *
 * The real interview is generated live over a websocket against a persisted
 * schedule the server checks ownership of, so it cannot be run for a rehearsal
 * without creating exactly the records Test Mode promises not to create. This
 * plays a fixed script instead and says so on every screen.
 *
 * What it does reproduce faithfully is everything around the questions: the
 * camera and face check the candidate sits under, the per-phase clock and
 * question budget taken from the backend's own phase definitions, the
 * one-question-at-a-time pacing, and the transcript at the end.
 */
export function TestModeInterviewPage({ phase }: Readonly<{ phase: InterviewPhaseId }>) {
  const script = INTERVIEW_SCRIPTS[phase];

  const [stage, setStage] = useState<Stage>('brief');
  const [visited, setVisited] = useState<Stage[]>(['brief']);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [endReason, setEndReason] = useState<'completed' | 'time-expired' | 'ended-early'>(
    'completed',
  );

  const goTo = useCallback((next: Stage) => {
    setStage(next);
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
  }, []);

  const finish = useCallback(
    (reason: 'completed' | 'time-expired' | 'ended-early') => {
      setEndReason(reason);
      goTo('transcript');
    },
    [goTo],
  );

  const timer = useTimer({
    initialSeconds: script.durationMinutes * 60,
    onExpire: () => finish('time-expired'),
  });

  const reset = useCallback(() => {
    timer.reset(0);
    setQuestionIndex(0);
    setAnswer('');
    setTurns([]);
    setStage('brief');
    setVisited(['brief']);
  }, [timer]);

  const start = useCallback(() => {
    timer.reset(script.durationMinutes * 60);
    timer.start();
    setQuestionIndex(0);
    setAnswer('');
    setTurns([]);
    goTo('interview');
  }, [goTo, script.durationMinutes, timer]);

  const currentQuestion = script.questions[questionIndex];
  const isLastQuestion = questionIndex === script.questions.length - 1;

  const submitAnswer = useCallback(() => {
    if (!currentQuestion) return;
    setTurns((prev) => [...prev, { question: currentQuestion, answer: answer.trim() }]);
    setAnswer('');
    if (isLastQuestion) {
      finish('completed');
    } else {
      setQuestionIndex((prev) => prev + 1);
    }
  }, [answer, currentQuestion, finish, isLastQuestion]);

  const spent = Math.max(0, script.durationMinutes * 60 - timer.secondsLeft);
  const answered = useMemo(() => turns.filter((turn) => turn.answer !== '').length, [turns]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">
          Test Mode — {script.displayName} interview
        </h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          {script.description}. {script.position}.
        </p>
      </div>

      <TestModeBanner title={`${script.displayName} interview`} onReset={reset} />

      <TestModeStepper stages={STAGES} current={stage} reachable={visited} onSelect={goTo} />

      {/* The one caveat that matters, repeated on every stage of this flow. */}
      <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface1)] px-4 py-3">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-[var(--textSecondary)]" />
        <p className="text-sm text-[var(--textSecondary)]">{INTERVIEW_SCRIPT_NOTICE}</p>
      </div>

      {stage === 'brief' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>This phase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Fact label="Phase" value={script.displayName} />
                <Fact label="Budget" value={`${script.durationMinutes} min`} />
                <Fact label="Target questions" value={String(script.targetQuestions)} />
              </div>
              <p className="text-sm text-[var(--textSecondary)]">
                A real interview runs all six phases in one session — Introduction, Background,
                Technical, Problem Solving, Behavioral, Closing — moving on when a phase runs out
                of budget or questions. This rehearses {script.displayName} alone.
              </p>
              {phase === 'BEHAVIORAL' && (
                <p className="text-sm text-[var(--textSecondary)]">
                  This is the round usually meant by &ldquo;HR interview&rdquo;. The system calls it{' '}
                  <strong>Behavioral</strong>, and asks for answers in STAR format.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => goTo('check')}>
              Continue to device check
            </Button>
            <Button variant="outline" onClick={start}>
              Skip to the interview
            </Button>
          </div>
        </>
      )}

      {stage === 'check' && (
        <>
          <DeviceCheckPreview />
          <Button variant="primary" onClick={start}>
            Start interview
          </Button>
        </>
      )}

      {stage === 'interview' && currentQuestion && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                Question {questionIndex + 1} of {script.questions.length}
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" size="sm">
                  {script.displayName}
                </Badge>
                <span
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
                    timer.secondsLeft <= 60
                      ? 'bg-[var(--error)]/10 text-[var(--error)]'
                      : 'bg-[var(--surface1)] text-[var(--text)]'
                  }`}
                >
                  <Clock size={16} />
                  {formatTimer(timer.secondsLeft)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface1)] px-4 py-3">
              <MessageSquare size={18} className="mt-0.5 flex-shrink-0 text-[var(--primary)]" />
              <p className="text-lg leading-relaxed text-[var(--text)]">{currentQuestion}</p>
            </div>

            {/* Typed rather than spoken. The real interview transcribes speech;
                reproducing that here would mean the live speech pipeline, which
                is exactly the backend this mode avoids. */}
            <div>
              <Textarea
                label="Answer"
                rows={6}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type an answer. A candidate speaks this, and their speech is transcribed into the same box."
              />
              <p className="mt-1 text-xs text-[var(--textTertiary)]">
                Speech-to-text is not run in Test Mode — type to move on.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => finish('ended-early')}>
                End here
              </Button>
              <Button
                variant="primary"
                rightIcon={isLastQuestion ? <Send size={16} /> : <ChevronRight size={16} />}
                onClick={submitAnswer}
              >
                {isLastQuestion ? 'Finish phase' : 'Next question'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'transcript' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Fact label="Questions asked" value={`${turns.length} / ${script.questions.length}`} />
                <Fact label="Answered" value={String(answered)} />
                <Fact label="Time used" value={formatTimer(spent)} />
              </div>

              {endReason === 'time-expired' && (
                <p className="flex items-center gap-2 text-sm text-[var(--warning)]">
                  <AlertTriangle size={14} />
                  The phase budget ran out. A real interview moves to the next phase at this point.
                </p>
              )}
              {endReason === 'ended-early' && (
                <p className="text-sm text-[var(--textSecondary)]">Ended early.</p>
              )}

              {/* No score. A real interview is scored by the AI against
                  evaluation categories; a script has nothing to score. */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface1)] px-4 py-3">
                <p className="text-sm text-[var(--textSecondary)]">
                  No evaluation is produced. A real interview is scored by the AI against its
                  evaluation categories as the conversation goes; there is no model in the loop
                  here, so there is nothing to score.
                </p>
              </div>
            </CardContent>
          </Card>

          {turns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {turns.map((turn, index) => (
                    <li key={`${index}-${turn.question}`} className="space-y-2">
                      <div className="flex items-start gap-3">
                        <MessageSquare
                          size={16}
                          className="mt-1 flex-shrink-0 text-[var(--primary)]"
                        />
                        <p className="text-[var(--text)]">{turn.question}</p>
                      </div>
                      <div className="flex items-start gap-3 pl-1">
                        <User size={16} className="mt-1 flex-shrink-0 text-[var(--textTertiary)]" />
                        <p className="whitespace-pre-wrap text-[var(--textSecondary)]">
                          {turn.answer || <span className="italic">No answer given</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={start}>
              Run this phase again
            </Button>
            <Button variant="ghost" onClick={reset}>
              Back to the brief
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-sm text-[var(--textSecondary)]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}
