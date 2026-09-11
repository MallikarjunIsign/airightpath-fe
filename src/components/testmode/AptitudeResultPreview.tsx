import { useMemo } from 'react';
import { CheckCircle2, MinusCircle, RotateCcw, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { paperTotalMarks } from '@/utils/exam-question.utils';
import { formatTimer } from '@/utils/format.utils';
import { DEFAULT_PASS_PERCENTAGE, moduleVerdict } from '@/utils/result.utils';
import type { Question } from '@/types/assessment.types';

/**
 * The scored outcome of a Test Mode aptitude run, plus the answer sheet.
 *
 * Scored here in the browser from the paper's own `correctAnswer` keys, using
 * the same pass rule the rest of the app applies (percentage against a pass
 * mark, never raw marks). Nothing is submitted, so there is no result row and
 * no `Result.percentage` — this screen is the only place the number exists.
 *
 * The answer sheet is the part that earns the feature: it shows whether a paper
 * is actually answerable, which questions have wrong keys, and which options
 * read ambiguously — all before a candidate ever sees it.
 */
export function AptitudeResultPreview({
  questions,
  answers,
  endReason,
  secondsLeft,
  durationMinutes,
  onRetake,
  onReset,
}: Readonly<{
  questions: Question[];
  answers: Record<number, string>;
  endReason: 'submitted' | 'time-expired';
  secondsLeft: number;
  durationMinutes: number;
  onRetake: () => void;
  onReset: () => void;
}>) {
  const scored = useMemo(() => {
    const totalMarks = paperTotalMarks(questions);
    let earned = 0;
    let correct = 0;
    let answered = 0;
    /** Questions whose key is missing — the paper cannot grade these at all. */
    let ungradable = 0;

    const rows = questions.map((question, index) => {
      const selected = answers[question.id];
      const key = question.correctAnswer;
      const marks = question.marks || 1;
      if (selected) answered += 1;
      if (!key) ungradable += 1;

      const isCorrect = !!selected && !!key && selected === key;
      if (isCorrect) {
        correct += 1;
        earned += marks;
      }

      return {
        number: index + 1,
        text: question.questionText,
        selected,
        key,
        marks,
        isCorrect,
        options: question.options,
      };
    });

    const percentage = totalMarks > 0 ? Math.round((earned / totalMarks) * 100) : 0;
    return { rows, totalMarks, earned, correct, answered, ungradable, percentage };
  }, [answers, questions]);

  const verdict = moduleVerdict(scored.percentage, DEFAULT_PASS_PERCENTAGE);
  const spent = Math.max(0, durationMinutes * 60 - secondsLeft);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Result</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" leftIcon={<RotateCcw size={14} />} onClick={onRetake}>
                Retake this paper
              </Button>
              <Button variant="ghost" size="sm" onClick={onReset}>
                Pick another paper
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Score"
              value={`${scored.percentage}%`}
              tone={verdict === 'PASSED' ? 'var(--success)' : 'var(--error)'}
            />
            <Stat label="Marks" value={`${scored.earned} / ${scored.totalMarks}`} />
            <Stat label="Correct" value={`${scored.correct} / ${questions.length}`} />
            <Stat label="Time used" value={formatTimer(spent)} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={verdict === 'PASSED' ? 'success' : 'error'} size="sm">
              {verdict === 'PASSED' ? 'Passed' : 'Failed'} at {DEFAULT_PASS_PERCENTAGE}%
            </Badge>
            <span className="text-sm text-[var(--textSecondary)]">
              {scored.answered} of {questions.length} answered
              {endReason === 'time-expired' && ' — the clock ran out'}
            </span>
          </div>

          {/* The pass mark here is the app default, because a rehearsal has no
              assignment to read one from. Said out loud so a borderline score is
              not mistaken for a verdict against a specific job's standard. */}
          <p className="text-xs text-[var(--textTertiary)]">
            Graded against the default {DEFAULT_PASS_PERCENTAGE}% pass mark. A real assessment is
            graded against the mark set when the paper was assigned, which may differ.
          </p>

          {scored.ungradable > 0 && (
            <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning)]/5 px-4 py-3">
              <p className="text-sm text-[var(--text)]">
                <strong>{scored.ungradable}</strong> question
                {scored.ungradable === 1 ? ' has' : 's have'} no <code>correctAnswer</code>, so
                {scored.ungradable === 1 ? ' it' : ' they'} can never be scored — a candidate would
                lose those marks whatever they picked. Worth fixing before this paper is assigned.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Answer sheet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%]">#</TableHead>
                  <TableHead className="w-[48%]">Question</TableHead>
                  <TableHead className="w-[14%]">Picked</TableHead>
                  <TableHead className="w-[14%]">Correct</TableHead>
                  <TableHead className="w-[16%]">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scored.rows.map((row) => (
                  <TableRow key={row.number}>
                    <TableCell className="align-top tabular-nums">{row.number}</TableCell>
                    <TableCell className="align-top">
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text)]">
                        {row.text}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      {row.selected ?? <span className="text-[var(--textTertiary)]">—</span>}
                    </TableCell>
                    <TableCell className="align-top">
                      {row.key ?? <span className="text-[var(--warning)]">missing</span>}
                    </TableCell>
                    <TableCell className="align-top">
                      <Outcome
                        answered={!!row.selected}
                        gradable={!!row.key}
                        isCorrect={row.isCorrect}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: Readonly<{ label: string; value: string; tone?: string }>) {
  return (
    <div>
      <p className="text-sm text-[var(--textSecondary)]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}

/**
 * Three outcomes, not two: a blank answer and a wrong answer are different
 * facts about a candidate, and a paper with no key is a different fact again —
 * about the paper.
 */
function Outcome({
  answered,
  gradable,
  isCorrect,
}: Readonly<{ answered: boolean; gradable: boolean; isCorrect: boolean }>) {
  if (!gradable) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-[var(--warning)]">
        <MinusCircle size={14} />
        No key
      </span>
    );
  }
  if (!answered) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-[var(--textTertiary)]">
        <MinusCircle size={14} />
        Skipped
      </span>
    );
  }
  return isCorrect ? (
    <span className="flex items-center gap-1.5 text-sm text-[var(--success)]">
      <CheckCircle2 size={14} />
      Correct
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-sm text-[var(--error)]">
      <XCircle size={14} />
      Wrong
    </span>
  );
}
