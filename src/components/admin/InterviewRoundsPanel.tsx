import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { interviewService } from '@/services/interview.service';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import type { InterviewRound, InterviewSchedule } from '@/types/interview.types';

const ROUNDS: InterviewRound[] = ['L2_TECHNICAL', 'L3_BEHAVIORAL'];

/**
 * What the selected candidates have already sat for one round.
 *
 * `attempts` counts schedules, not candidates: every assignment creates its own
 * schedule, so a candidate given L2 twice has two attempts and both are kept.
 */
interface RoundSummary {
  attempts: number;
  candidatesWithAttempt: number;
  completed: number;
  passed: number;
  outstanding: number;
}

/**
 * Booking and re-booking interview rounds, as its own step.
 *
 * <p>These two actions used to sit among the stage-specific bulk actions, which
 * gated them by where the candidate had reached: L2 was offered only at
 * EXAM_COMPLETED and L3 only once an interview existed. That made the ordinary
 * cases impossible — a candidate whose L2 was cut short by a lost connection
 * could not be given another, and a strong candidate could not be moved to L3
 * from anywhere except the two interview stages.</p>
 *
 * <p>Both rounds are now bookable at any point, as often as needed, which is how
 * assessments already work. Nothing is overwritten: each assignment is a fresh
 * attempt with its own deadline, transcript and result, and the counts here are
 * read back from those rows.</p>
 */
export function InterviewRoundsPanel({
  jobPrefix,
  selectedEmails,
  onAssignRound,
  refreshKey,
}: Readonly<{
  jobPrefix: string;
  selectedEmails: Set<string>;
  onAssignRound: (round: InterviewRound) => void;
  /** Changed by the parent after an assignment, to re-read the counts. */
  refreshKey?: number;
}>) {
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!jobPrefix) return;
    setLoading(true);
    try {
      const res = await interviewService.getResults(jobPrefix);
      setSchedules(res.data ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [jobPrefix]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const summaries = useMemo(() => {
    const selected = new Set([...selectedEmails].map((e) => e.toLowerCase()));

    return ROUNDS.reduce<Record<InterviewRound, RoundSummary>>(
      (acc, round) => {
        const mine = schedules.filter(
          (s) =>
            (s.round ?? 'L2_TECHNICAL') === round &&
            (selected.size === 0 || selected.has((s.email ?? '').toLowerCase())),
        );
        acc[round] = {
          attempts: mine.length,
          candidatesWithAttempt: new Set(mine.map((s) => (s.email ?? '').toLowerCase())).size,
          completed: mine.filter((s) => s.attemptStatus === 'COMPLETED').length,
          passed: mine.filter((s) => s.interviewResult === 'PASSED').length,
          outstanding: mine.filter((s) => s.attemptStatus !== 'COMPLETED').length,
        };
        return acc;
      },
      {} as Record<InterviewRound, RoundSummary>,
    );
  }, [schedules, selectedEmails]);

  const selectedCount = selectedEmails.size;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Video size={18} className="text-[var(--primary)]" />
            <CardTitle>Interview rounds</CardTitle>
          </div>
          <p className="text-xs text-[var(--textSecondary)]">
            {selectedCount === 0
              ? 'Counts cover every candidate on this job. Select candidates to book a round.'
              : `${selectedCount} candidate${selectedCount === 1 ? '' : 's'} selected`}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <div className="space-y-3">
            {ROUNDS.map((round) => {
              const summary = summaries[round];
              // "Reassign" only where the selection has already sat this round —
              // the word is a promise about what happens, and on a fresh
              // candidate nothing is being re-done.
              const isRepeat = selectedCount > 0 && summary.candidatesWithAttempt > 0;

              return (
                <div
                  key={round}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface1)] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text)]">
                      {INTERVIEW_ROUND_LABELS[round]}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {summary.attempts === 0 ? (
                        <span className="text-xs text-[var(--textTertiary)]">
                          No attempts yet
                        </span>
                      ) : (
                        <>
                          <Badge variant="info" size="sm">
                            {summary.attempts} attempt{summary.attempts === 1 ? '' : 's'}
                          </Badge>
                          {summary.outstanding > 0 && (
                            <Badge variant="warning" size="sm">
                              {summary.outstanding} outstanding
                            </Badge>
                          )}
                          {summary.completed > 0 && (
                            <Badge variant="secondary" size="sm">
                              {summary.completed} completed
                            </Badge>
                          )}
                          {summary.passed > 0 && (
                            <Badge variant="success" size="sm">
                              {summary.passed} passed
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={isRepeat ? <RotateCcw size={14} /> : <Video size={14} />}
                    disabled={selectedCount === 0}
                    onClick={() => onAssignRound(round)}
                    title={
                      selectedCount === 0
                        ? 'Select candidates first'
                        : `Books a new ${INTERVIEW_ROUND_LABELS[round]} attempt. Existing attempts are kept.`
                    }
                  >
                    {isRepeat ? 'Reassign' : 'Assign'} {INTERVIEW_ROUND_LABELS[round]}
                    {selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </Button>
                </div>
              );
            })}

            <p className="text-xs text-[var(--textTertiary)]">
              Every assignment is a new attempt with its own deadline, transcript and result.
              Previous attempts are kept and stay visible in Interview Results.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
