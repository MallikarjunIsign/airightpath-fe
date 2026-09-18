import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Clock,
  Loader2,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RecordingPlayerButton } from '@/components/admin/RecordingPlayerButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { RadialScore, SummaryStat, SkillBar } from '@/components/admin/result/ResultPrimitives';
import { ProctoringCaptures } from '@/components/admin/result/ProctoringCaptures';
import { CodeBlock } from '@/components/interview/CodeBlock';
import { ROUTES } from '@/config/routes';
import type { NavOrigin } from '@/components/ui/BackLink';
import { interviewService, type VoiceConversationEntryDTO } from '@/services/interview.service';
import { aiService } from '@/services/ai.service';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import type {
  CompletionReason,
  InterviewRound,
  InterviewSchedule,
  ProctoringEvent,
  VoiceEvaluationResult,
} from '@/types/interview.types';

/** Pipeline order. L2 precedes L3 however the rows happen to be dated. */
const ROUND_ORDER: InterviewRound[] = ['L2_TECHNICAL', 'L3_BEHAVIORAL'];

type Tab = 'overview' | InterviewRound;

/**
 * Everything loaded for one round.
 *
 * Kept per round rather than per page because each round is separately
 * scheduled, separately sat and separately scored — a candidate can pass L2 and
 * fail L3, and merging the two would hide exactly that.
 */
interface RoundDetail {
  schedule: InterviewSchedule;
  evaluation: VoiceEvaluationResult | null;
  transcript: VoiceConversationEntryDTO[];
  proctoring: ProctoringEvent[];
}

/** One sitting, told where it falls in the sequence of sittings of its round. */
interface RoundAttempt extends RoundDetail {
  /** 1-based, oldest first, so "Attempt 2" means the same thing on every visit. */
  attemptNumber: number;
  attemptCount: number;
}

/** Every sitting of one round, newest first. */
interface RoundGroup {
  key: InterviewRound;
  label: string;
  attempts: RoundAttempt[];
}

/**
 * Which round a schedule belongs to.
 *
 * Defaults rather than returning undefined: the server reports the default
 * round for interviews booked before rounds existed, and a tab keyed on
 * undefined would strand those rows with no tab to open them.
 */
function roundKeyOf(schedule: InterviewSchedule): InterviewRound {
  return schedule.round ?? 'L2_TECHNICAL';
}

function roundLabelOf(schedule: InterviewSchedule): string {
  if (schedule.roundLabel) return schedule.roundLabel;
  if (schedule.round) return INTERVIEW_ROUND_LABELS[schedule.round];
  return INTERVIEW_ROUND_LABELS.L2_TECHNICAL;
}

function resultVariant(result: string): 'success' | 'error' | 'warning' {
  if (result === 'PASSED') return 'success';
  if (result === 'FAILED') return 'error';
  return 'warning';
}

function statusVariant(status: string): 'success' | 'info' | 'warning' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'IN_PROGRESS') return 'info';
  return 'warning';
}

function recommendationVariant(recommendation: string): 'success' | 'warning' | 'error' {
  if (recommendation === 'STRONG_HIRE' || recommendation === 'HIRE') return 'success';
  if (recommendation === 'NO_HIRE') return 'warning';
  return 'error';
}

function completionLabel(reason?: CompletionReason): string {
  switch (reason) {
    case 'NATURAL_COMPLETION': return 'Completed';
    case 'EARLY_TERMINATION_POOR_PERFORMANCE': return 'Ended early';
    case 'CANDIDATE_ENDED': return 'Candidate ended';
    case 'PROCTORING_VIOLATION': return 'Proctoring violation';
    case 'TIMEOUT': return 'Timed out';
    case 'MAX_SKIPS': return 'Too many skips';
    default: return '--';
  }
}

function durationLabel(schedule: InterviewSchedule): string {
  return minutesLabel(durationMinutes(schedule));
}

function warningsOf(schedule: InterviewSchedule): number {
  return schedule.warningCount ?? schedule.proctoringWarnings ?? 0;
}

/**
 * When a sitting happened, for ordering attempts of the same round.
 *
 * `startedAt` is the sitting itself; `assignedAt` stands in for one that was
 * booked and never opened, so a no-show still takes its place in the sequence
 * instead of collapsing to the epoch alongside every other no-show.
 */
function attemptTime(schedule: InterviewSchedule): number {
  const stamp = new Date(schedule.startedAt ?? schedule.assignedAt).getTime();
  return Number.isNaN(stamp) ? 0 : stamp;
}

/**
 * The rows for one candidate, split into rounds and then into the sittings of
 * each round.
 *
 * A round can be sat more than once — a repeat L2 after a borderline first
 * attempt — and those rows arrive as siblings with nothing marking them apart.
 * Numbering runs oldest-first so an attempt keeps its number as more are added;
 * the list is handed back newest-first because that is the one being decided on.
 */
function groupByRound(details: RoundDetail[]): RoundGroup[] {
  const byRound = new Map<InterviewRound, RoundDetail[]>();
  for (const detail of details) {
    const key = roundKeyOf(detail.schedule);
    const bucket = byRound.get(key);
    if (bucket) bucket.push(detail);
    else byRound.set(key, [detail]);
  }

  return [...byRound.entries()]
    .sort(([a], [b]) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
    .map(([key, bucket]) => {
      // Oldest first to number them, then reversed — id breaks a tie so two
      // sittings stamped the same second do not swap places between renders.
      const chronological = [...bucket].sort(
        (a, b) =>
          attemptTime(a.schedule) - attemptTime(b.schedule) || a.schedule.id - b.schedule.id,
      );
      const attempts = chronological
        .map((detail, index) => ({
          ...detail,
          attemptNumber: index + 1,
          attemptCount: chronological.length,
        }))
        .reverse();
      return { key, label: roundLabelOf(attempts[0].schedule), attempts };
    });
}

/** Minutes a sitting ran for, or null when it was never opened or never closed. */
function durationMinutes(schedule: InterviewSchedule): number | null {
  if (!schedule.startedAt || !schedule.endedAt) return null;
  const minutes = Math.round(
    (new Date(schedule.endedAt).getTime() - new Date(schedule.startedAt).getTime()) / 60000,
  );
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function minutesLabel(minutes: number | null): string {
  if (minutes == null) return '--';
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

/** "Sep 18, 2026, 14:05" for an attempt heading, or nothing if it will not parse. */
function attemptDateLabel(schedule: InterviewSchedule): string {
  const raw = schedule.startedAt ?? schedule.assignedAt;
  const stamp = new Date(raw);
  if (Number.isNaN(stamp.getTime())) return '';
  return stamp.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One candidate's interview across every round they sat.
 *
 * The results table lists rounds, and its detail lived in a dialog — which
 * cannot hold a full transcript, per-area scores and proctoring evidence at
 * once, and cannot be linked to or returned to. This is the assessment result
 * page's shape applied to interviews: a header, the figures, then a tab per
 * round.
 */
export function InterviewCandidateResultPage() {
  const { jobPrefix = '', email = '' } = useParams();
  const location = useLocation();

  /**
   * Where "back" goes.
   *
   * This page is reachable from two places now — the Interview Results list and
   * a candidate row on Candidates — and it used to send everyone to the list
   * regardless. An admin who opened a result from Candidates was put on a
   * screen they had not come from, with their job selection, stage tab and
   * ticked rows gone. Whoever navigated here says where back leads; the list
   * stays the fallback for a link opened cold.
   */
  const back: NavOrigin = (location.state as { from?: NavOrigin } | null)?.from ?? {
    label: 'Interview Results',
    path: ROUTES.ADMIN.INTERVIEWS_RESULTS,
  };
  const navigate = useNavigate();

  const [rounds, setRounds] = useState<RoundDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await interviewService.getResults(jobPrefix);
      const mine = (res.data ?? [])
        .filter((row) => row.email?.toLowerCase() === email.toLowerCase())
        .sort(
          (a, b) =>
            ROUND_ORDER.indexOf(a.round ?? 'L2_TECHNICAL') -
            ROUND_ORDER.indexOf(b.round ?? 'L2_TECHNICAL'),
        );

      // Each round's evidence in parallel, and allSettled so one round with no
      // evaluation yet does not blank the rounds either side of it.
      const detailed = await Promise.all(
        mine.map(async (schedule) => {
          const [evaluation, transcript, proctoring] = await Promise.allSettled([
            aiService.getVoiceEvaluation(schedule.id),
            interviewService.getConversation(schedule.id),
            interviewService.getProctoringEvents(schedule.id),
          ]);
          return {
            schedule,
            evaluation: evaluation.status === 'fulfilled' ? evaluation.value.data : null,
            transcript: transcript.status === 'fulfilled' ? transcript.value.data ?? [] : [],
            proctoring: proctoring.status === 'fulfilled' ? proctoring.value.data ?? [] : [],
          };
        }),
      );
      setRounds(detailed);
    } catch {
      setLoadError('This candidate\'s interview results could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [jobPrefix, email]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupByRound(rounds), [rounds]);

  /**
   * Mean over rounds, taking each round's most recent scored sitting.
   *
   * Averaging every row instead would let a failed first attempt keep dragging
   * the headline down after the candidate re-sat and passed — which reads as a
   * worse candidate rather than as an earlier attempt.
   */
  const overall = useMemo(() => {
    const scored = groups
      .map((group) =>
        group.attempts
          .map((a) => a.evaluation?.overallScore ?? a.schedule.evaluation?.overallScore)
          .find((score): score is number => score != null),
      )
      .filter((score): score is number => score != null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, score) => sum + score, 0) / scored.length;
  }, [groups]);

  const totalWarnings = useMemo(
    () => rounds.reduce((sum, r) => sum + warningsOf(r.schedule), 0),
    [rounds],
  );

  /**
   * Time actually spent interviewing, summed over sittings.
   *
   * Not the span from the first start to the last end: L2 on Monday and L3 on
   * Friday are four days apart and none of that gap was an interview.
   */
  const totalMinutes = useMemo(() => {
    const measured = rounds
      .map((r) => durationMinutes(r.schedule))
      .filter((minutes): minutes is number => minutes != null);
    if (measured.length === 0) return null;
    return measured.reduce((sum, minutes) => sum + minutes, 0);
  }, [rounds]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (loadError || rounds.length === 0) {
    return (
      <div className="space-y-6">
        <BackLink label={back.label} onClick={() => navigate(back.path, { state: back.state })} />
        <EmptyState
          icon={<Users size={48} />}
          title={loadError ? 'Could not load results' : 'No interview rounds'}
          description={
            loadError ?? `${email} has no interview rounds on ${jobPrefix}.`
          }
        />
      </div>
    );
  }

  const tabs: Tab[] = ['overview', ...groups.map((group) => group.key)];

  return (
    <div className="space-y-6">
      <BackLink label={back.label} onClick={() => navigate(back.path, { state: back.state })} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xl font-bold text-white">
                {email.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="break-all text-2xl font-bold text-[var(--text)]">{email}</h1>
                <p className="mt-0.5 text-sm text-[var(--textSecondary)]">
                  Job: {jobPrefix}
                  <span className="mx-2 text-[var(--textTertiary)]">|</span>
                  {groups.length} round{groups.length === 1 ? '' : 's'}
                  {/* Only worth saying when a round was sat more than once —
                      otherwise it restates the round count. */}
                  {rounds.length > groups.length && (
                    <>
                      <span className="mx-2 text-[var(--textTertiary)]">|</span>
                      {rounds.length} attempts
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* The standing of each round is its latest sitting; older ones
                  are read inside the round's own tab. */}
              {groups.map((group) => (
                <Badge
                  key={group.key}
                  variant={resultVariant(group.attempts[0].schedule.interviewResult)}
                >
                  {group.label}: {group.attempts[0].schedule.interviewResult}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── The figures ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryStat
          icon={<BarChart3 size={16} />}
          value={overall != null ? `${overall.toFixed(1)}/10` : '--'}
          label="Overall score"
          tone={overall == null ? 'neutral' : overall >= 6 ? 'success' : 'error'}
          hint="Mean of the latest scored attempt at each round"
        />
        <SummaryStat
          icon={<Users size={16} />}
          value={groups.length}
          label="Rounds sat"
          hint={
            rounds.length > groups.length
              ? `${rounds.length} attempts in total`
              : undefined
          }
        />
        <SummaryStat
          icon={<Shield size={16} />}
          value={totalWarnings}
          label="Proctoring warnings"
          tone={totalWarnings >= 3 ? 'error' : totalWarnings > 0 ? 'warning' : 'success'}
        />
        <SummaryStat
          icon={<Clock size={16} />}
          value={minutesLabel(totalMinutes)}
          label="Time in interview"
          hint="Summed over every sitting"
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--bgSubtle,var(--surface1))] p-1.5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          const group = tab === 'overview' ? undefined : groups.find((g) => g.key === tab);
          // The server's label where there is one, and the attempt count beside
          // it so a re-sat round says so before the tab is opened.
          const label =
            tab === 'overview'
              ? 'Overview'
              : `${group?.label ?? INTERVIEW_ROUND_LABELS[tab as InterviewRound]}${
                  (group?.attempts.length ?? 0) > 1 ? ` (${group?.attempts.length})` : ''
                }`;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--textSecondary)] hover:bg-[var(--bgMuted,var(--surface2))] hover:text-[var(--text)]'
              }`}
            >
              <span className="flex-shrink-0">
                {tab === 'overview' ? <BarChart3 size={15} /> : <MessageSquare size={15} />}
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.flatMap((group) =>
            group.attempts.map((attempt) => (
              <RoundSummaryCard
                key={attempt.schedule.id}
                attempt={attempt}
                onOpen={() => setActiveTab(group.key)}
              />
            )),
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {(groups.find((group) => group.key === activeTab)?.attempts ?? []).map(
            (attempt, index) => (
              <AttemptSection
                key={attempt.schedule.id}
                attempt={attempt}
                // The newest sitting is the one being decided on, so it opens;
                // earlier ones stay folded rather than burying it under a
                // transcript that has already been superseded.
                defaultOpen={index === 0}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function BackLink({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm font-medium text-[var(--textSecondary)] transition-colors hover:text-[var(--text)]"
    >
      <ArrowLeft size={16} />
      Back to {label}
    </button>
  );
}

// ── Overview ──────────────────────────────────────────────────────────

function RoundSummaryCard({
  attempt,
  onOpen,
}: Readonly<{ attempt: RoundAttempt; onOpen: () => void }>) {
  const { schedule, evaluation, attemptNumber, attemptCount } = attempt;
  const score = evaluation?.overallScore ?? schedule.evaluation?.overallScore;
  const recommendation = evaluation?.recommendation ?? schedule.evaluation?.recommendation;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{roundLabelOf(schedule)}</CardTitle>
            {attemptCount > 1 && (
              <p className="mt-0.5 text-xs text-[var(--textTertiary)]">
                Attempt {attemptNumber} of {attemptCount}
                {attemptDateLabel(schedule) && ` · ${attemptDateLabel(schedule)}`}
              </p>
            )}
          </div>
          <Badge variant={statusVariant(schedule.attemptStatus)} size="sm">
            {schedule.attemptStatus.replace(/_/g, ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          {/* The dial is on a 0-100 track and interview scores are 0-10. */}
          <RadialScore
            score={score != null ? score * 10 : 0}
            label="Score"
            status={schedule.interviewResult}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-[var(--textSecondary)]">
              {score != null ? `${score.toFixed(1)} / 10` : 'Not scored yet'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={resultVariant(schedule.interviewResult)} size="sm">
                {schedule.interviewResult}
              </Badge>
              {recommendation && (
                <Badge variant={recommendationVariant(recommendation)} size="sm">
                  {recommendation.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div>
                <dt className="text-[var(--textTertiary)]">Duration</dt>
                <dd className="text-[var(--textSecondary)]">{durationLabel(schedule)}</dd>
              </div>
              <div>
                <dt className="text-[var(--textTertiary)]">Warnings</dt>
                <dd className="text-[var(--textSecondary)]">{warningsOf(schedule)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onOpen}>
          Transcript and scores
        </Button>
      </CardContent>
    </Card>
  );
}

// ── One attempt in full ───────────────────────────────────────────────

/**
 * One sitting, boxed and headed with which sitting it is.
 *
 * A round sat twice used to render as two panels butted together in one flow,
 * so a reviewer scrolling through scores, transcript and proctoring evidence
 * had no way of telling where the first sitting ended and the second began.
 * Each one now opens and closes on its own.
 */
function AttemptSection({
  attempt,
  defaultOpen,
}: Readonly<{ attempt: RoundAttempt; defaultOpen: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  const { schedule, attemptNumber, attemptCount } = attempt;
  const date = attemptDateLabel(schedule);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface1)]">
      <div className="flex flex-wrap items-center gap-2 px-2 py-2 sm:px-3">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--bgMuted,var(--surface2))]"
        >
          <ChevronDown
            size={16}
            className={`flex-shrink-0 text-[var(--textTertiary)] transition-transform duration-200 ${
              open ? '' : '-rotate-90'
            }`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--text)]">
              {attemptCount > 1
                ? `Attempt ${attemptNumber} of ${attemptCount}`
                : roundLabelOf(schedule)}
            </span>
            {date && (
              <span className="block truncate text-xs text-[var(--textTertiary)]">{date}</span>
            )}
          </span>
        </button>

        {/* Outside the toggle: a button cannot hold buttons, and these open
            players rather than folding the section. */}
        <div className="flex flex-wrap items-center gap-2 px-2">
          <Badge variant={statusVariant(schedule.attemptStatus)} size="sm">
            {schedule.attemptStatus.replace(/_/g, ' ')}
          </Badge>
          <Badge variant={resultVariant(schedule.interviewResult)} size="sm">
            {schedule.interviewResult}
          </Badge>
          <Badge variant="info" size="sm">{completionLabel(schedule.completionReason)}</Badge>
          {/* Two separate recordings: the candidate's camera and the screen
              they shared. For a coding round the screen is the only evidence of
              how the answer was reached, so it gets its own button rather than
              being folded into "Recording". */}
          {schedule.recordReferences && (
            <RecordingPlayerButton scheduleId={schedule.id} kind="camera" label="Camera" />
          )}
          {schedule.screenRecordReferences && (
            <RecordingPlayerButton scheduleId={schedule.id} kind="screen" label="Shared screen" />
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] p-3 sm:p-4">
          <RoundDetailPanel round={attempt} />
        </div>
      )}
    </section>
  );
}

function RoundDetailPanel({ round }: Readonly<{ round: RoundDetail }>) {
  const { schedule, evaluation, transcript, proctoring } = round;
  const resolved = evaluation;

  return (
    <div className="space-y-6">
      {schedule.completionReason === 'EARLY_TERMINATION_POOR_PERFORMANCE' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-200">
            This round was ended early after consistently poor performance — frequent skips, very
            short answers, or low confidence. Read the scores with that in mind.
          </p>
        </div>
      )}

      {/* ── Who sat it, and where ───────────────────────────────────── */}
      <ProctoringCaptures
        interviewScheduleId={schedule.id}
        candidateEmail={schedule.email}
        jobPrefix={schedule.jobPrefix}
        moduleLabel={roundLabelOf(schedule)}
        contextNoun="interview"
      />

      {/* ── Proctoring ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--warning,orange)]" />
            <CardTitle>Proctoring events ({proctoring.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {proctoring.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--textSecondary)]">
              Nothing was flagged during this round.
            </p>
          ) : (
            <ul className="space-y-2">
              {proctoring.map((event, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface1)] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {event.eventType?.replace(/_/g, ' ') ?? 'Event'}
                    </p>
                    {event.details && (
                      <p className="text-xs text-[var(--textSecondary)]">{event.details}</p>
                    )}
                  </div>
                  {event.timestamp && (
                    <span className="flex-shrink-0 text-xs text-[var(--textTertiary)]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Scores by area ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[var(--primary)]" />
            <CardTitle>Scores by area</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {resolved?.categoryScores?.length ? (
            <div className="space-y-4">
              {resolved.categoryScores.map((category) => (
                <SkillBar
                  key={category.category}
                  label={category.category}
                  // Category scores are 0-10; SkillBar draws a percentage.
                  percentage={Math.round((category.score ?? 0) * 10)}
                  detail={`${category.score}/10`}
                />
              ))}
              {resolved.summary && (
                <div className="border-t border-[var(--border)] pt-4">
                  <h4 className="mb-1.5 text-sm font-semibold text-[var(--text)]">Summary</h4>
                  <p className="text-sm leading-relaxed text-[var(--textSecondary)]">
                    {resolved.summary}
                  </p>
                </div>
              )}
              <div className="grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                <BulletList title="Strengths" items={resolved.strengths} tone="success" />
                <BulletList
                  title="Areas to improve"
                  items={resolved.areasForImprovement}
                  tone="warning"
                />
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[var(--textSecondary)]">
              This round has not been scored yet. Scores appear once the interview completes.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── The conversation ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[var(--primary)]" />
            <CardTitle>Transcript ({transcript.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {transcript.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--textSecondary)]">
              No transcript recorded for this round.
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((entry) => (
                <TranscriptTurn key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function BulletList({
  title,
  items,
  tone,
}: Readonly<{ title: string; items?: string[]; tone: 'success' | 'warning' }>) {
  if (!items || items.length === 0) return null;
  const color = tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning,orange)]';
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-[var(--text)]">{title}</h4>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-[var(--textSecondary)]">
            <span className={`flex-shrink-0 ${color}`}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranscriptTurn({ entry }: Readonly<{ entry: VoiceConversationEntryDTO }>) {
  const isCandidate = entry.role === 'CANDIDATE';
  return (
    <div className={`flex ${isCandidate ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isCandidate
            ? 'bg-[var(--primary)] text-white'
            : 'bg-[var(--surface1)] text-[var(--text)]'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{entry.content}</p>

        {isCandidate && entry.codeContent && (
          <CodeBlock code={entry.codeContent} language={entry.codeLanguage} />
        )}
        {/* The model was shown this when scoring, so a reviewer without it is
            reading a different transcript than the one that produced the score. */}
        {isCandidate && entry.codeOutput?.trim() && (
          <div className="mt-2 rounded-lg bg-black/20 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Run output
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-white/90">
              {entry.codeOutput}
            </pre>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`text-xs ${isCandidate ? 'text-white/60' : 'text-[var(--textTertiary)]'}`}
          >
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          {isCandidate && entry.wordsPerMinute != null && (
            <span className="text-xs text-white/60">{Math.round(entry.wordsPerMinute)} WPM</span>
          )}
          {isCandidate && entry.confidenceScore != null && (
            <span className="text-xs text-white/60">
              {Math.round(entry.confidenceScore)}% confidence
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
