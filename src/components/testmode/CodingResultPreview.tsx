import { useMemo } from 'react';
import { Code2, MinusCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { isSkeletonCode } from '@/utils/code.utils';
import { formatTimer } from '@/utils/format.utils';
import type { CodingQuestion } from '@/types/assessment.types';

/**
 * What a Test Mode coding run produced.
 *
 * There is no score here, and that is the honest outcome rather than a gap: a
 * coding score is the test-case pass rate, test cases are graded by the
 * compiler service, and Test Mode never calls it. Reporting a percentage
 * without running anything would be inventing a number — precisely the failure
 * this codebase has fought elsewhere.
 *
 * So the report answers the questions a rehearsal can genuinely answer: was
 * every problem reachable in the time, which ones were left untouched, and what
 * did the paper actually look like from the inside.
 */
export function CodingResultPreview({
  questions,
  codeByQuestion,
  language,
  endReason,
  secondsLeft,
  durationMinutes,
  onRetake,
  onReset,
}: Readonly<{
  questions: CodingQuestion[];
  codeByQuestion: Record<number, string>;
  language: string;
  endReason: 'submitted' | 'time-expired';
  secondsLeft: number;
  durationMinutes: number;
  onRetake: () => void;
  onReset: () => void;
}>) {
  const summary = useMemo(() => {
    const rows = questions.map((question, index) => {
      const code = codeByQuestion[question.id];
      // Untouched means "absent, or still the language skeleton" — a candidate
      // who opened a problem and typed nothing has not attempted it.
      const attempted = code !== undefined && code.trim() !== '' && !isSkeletonCode(code);
      return {
        number: index + 1,
        title: question.title,
        testCases: question.testCases?.length ?? 0,
        lines: attempted ? code.trimEnd().split('\n').length : 0,
        attempted,
      };
    });

    return {
      rows,
      attempted: rows.filter((row) => row.attempted).length,
      totalTestCases: rows.reduce((total, row) => total + row.testCases, 0),
    };
  }, [codeByQuestion, questions]);

  const spent = Math.max(0, durationMinutes * 60 - secondsLeft);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Run summary</CardTitle>
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
            <Stat label="Problems attempted" value={`${summary.attempted} / ${questions.length}`} />
            <Stat label="Test cases in paper" value={String(summary.totalTestCases)} />
            <Stat label="Language" value={language} />
            <Stat label="Time used" value={formatTimer(spent)} />
          </div>

          {endReason === 'time-expired' && (
            <p className="text-sm text-[var(--warning)]">
              The clock ran out. A candidate's work would have been submitted automatically at this
              point.
            </p>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface1)] px-4 py-3">
            <p className="text-sm text-[var(--textSecondary)]">
              No score is shown because no code was executed. A real attempt is scored on the
              proportion of test cases that pass, which requires the compiler service — Test Mode
              deliberately never calls it, so there is nothing here to score.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per problem</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {summary.rows.map((row) => (
              <li
                key={row.number}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--borderMuted,var(--border))] px-4 py-3"
              >
                <span className="font-mono text-sm text-[var(--textTertiary)]">{row.number}</span>
                <span className="min-w-0 flex-1 font-medium text-[var(--text)]">{row.title}</span>
                <span className="text-sm text-[var(--textSecondary)]">
                  {row.testCases} test case{row.testCases === 1 ? '' : 's'}
                </span>
                {row.attempted ? (
                  <Badge variant="success" size="sm">
                    <Code2 size={12} className="mr-1 inline" />
                    {row.lines} line{row.lines === 1 ? '' : 's'} written
                  </Badge>
                ) : (
                  <Badge variant="secondary" size="sm">
                    <MinusCircle size={12} className="mr-1 inline" />
                    Untouched
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-sm text-[var(--textSecondary)]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}
