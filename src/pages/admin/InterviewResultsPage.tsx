import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Video,
  ExternalLink,
  Eye,
  Download,
  Users,
  TrendingUp,
  Clock,
  Award,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobService } from '@/services/job.service';
import { interviewService } from '@/services/interview.service';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import type { JobPostDTO } from '@/types/job.types';
import type { InterviewSchedule, InterviewStats, CompletionReason, InterviewRound } from '@/types/interview.types';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';

/**
 * Widths for the fixed-layout table, in two sets.
 *
 * Pixels, not percentages. Each header carries 32px of padding and is a single
 * uppercase word with no break opportunity, so a percentage column that ends up
 * narrower than its own heading cannot wrap — "DURATION", "WARNINGS" and
 * "RECOMMENDATION" simply overflowed into the next column and the header row
 * read as one run-on word. Absolute widths are sized to the longest heading and
 * to the badges underneath it, and `TABLE_MIN_WIDTH` lets the table scroll
 * inside its card rather than compress below them.
 *
 * Kept as values rather than Tailwind `w-[..]` classes because Tailwind only
 * emits classes it can see in the source, never ones built at runtime.
 */
const COLUMN_WIDTHS = {
  withRound: {
    candidate: '200px', round: '130px', status: '115px', result: '100px', score: '85px',
    duration: '100px', warnings: '105px', completion: '125px', recommendation: '155px',
    actions: '150px',
  },
  withoutRound: {
    // `round` is never read here — the column is not rendered — but both sets
    // need the same keys for the lookup below to typecheck.
    candidate: '230px', round: '0', status: '125px', result: '110px', score: '95px',
    duration: '105px', warnings: '110px', completion: '135px', recommendation: '165px',
    actions: '160px',
  },
} as const;

/** Narrowest the table may get before the card scrolls it sideways. */
const TABLE_MIN_WIDTH = '1265px';

/** 'ALL' is the default view; the rest mirror the server's InterviewRound. */
type RoundFilter = 'ALL' | InterviewRound;

const ROUND_FILTER_OPTIONS: { value: RoundFilter; label: string }[] = [
  { value: 'ALL', label: 'All rounds' },
  { value: 'L2_TECHNICAL', label: INTERVIEW_ROUND_LABELS.L2_TECHNICAL },
  { value: 'L3_BEHAVIORAL', label: INTERVIEW_ROUND_LABELS.L3_BEHAVIORAL },
];

/**
 * What to call an interview's round.
 *
 * Prefers the label the server rendered, falls back to mapping the enum, and
 * only then to the technical round — which is what a row with no round at all
 * means, since that is the round the server defaults historic schedules to.
 */
function roundLabelOf(interview: InterviewSchedule): string {
  if (interview.roundLabel) return interview.roundLabel;
  if (interview.round) return INTERVIEW_ROUND_LABELS[interview.round];
  return INTERVIEW_ROUND_LABELS.L2_TECHNICAL;
}

function getStatusVariant(status: string): 'warning' | 'info' | 'success' {
  switch (status) {
    case 'NOT_ATTEMPTED':
      return 'warning';
    case 'IN_PROGRESS':
      return 'info';
    case 'COMPLETED':
      return 'success';
    default:
      return 'warning';
  }
}

function getResultVariant(result: string): 'warning' | 'success' | 'error' {
  switch (result) {
    case 'PASSED':
      return 'success';
    case 'FAILED':
      return 'error';
    default:
      return 'warning';
  }
}

function getCompletionReasonLabel(reason?: CompletionReason): string {
  switch (reason) {
    case 'NATURAL_COMPLETION': return 'Completed';
    case 'EARLY_TERMINATION_POOR_PERFORMANCE': return 'Early Termination';
    case 'CANDIDATE_ENDED': return 'Candidate Ended';
    case 'PROCTORING_VIOLATION': return 'Proctoring Violation';
    case 'TIMEOUT': return 'Timed Out';
    case 'MAX_SKIPS': return 'Max Skips';
    default: return '--';
  }
}

function getCompletionReasonVariant(reason?: CompletionReason): 'success' | 'warning' | 'error' | 'info' {
  switch (reason) {
    case 'NATURAL_COMPLETION': return 'success';
    case 'EARLY_TERMINATION_POOR_PERFORMANCE': return 'error';
    case 'CANDIDATE_ENDED': return 'info';
    case 'PROCTORING_VIOLATION': return 'error';
    case 'TIMEOUT': return 'warning';
    case 'MAX_SKIPS': return 'warning';
    default: return 'info';
  }
}

function getRecommendationVariant(recommendation: string): 'success' | 'warning' | 'error' {
  if (recommendation === 'STRONG_HIRE' || recommendation === 'HIRE') return 'success';
  if (recommendation === 'NO_HIRE') return 'warning';
  return 'error';
}

/** Warnings are reported under either field depending on interview vintage. */
function warningCountOf(interview: InterviewSchedule): number {
  return interview.warningCount ?? interview.proctoringWarnings ?? 0;
}

// ── Cells shared by the desktop row and the mobile card ────────────────

function ScoreCell({ interview }: Readonly<{ interview: InterviewSchedule }>) {
  const score = interview.evaluation?.overallScore;
  if (score == null) return <span className="text-sm text-[var(--textTertiary)]">--</span>;
  return <span className="font-semibold text-[var(--text)]">{score.toFixed(1)}/10</span>;
}

function RoundCell({ interview }: Readonly<{ interview: InterviewSchedule }>) {
  // Behavioural reads as the later, softer round; technical as the default one.
  // Neither is a pass/fail signal, so both stay clear of success/error colours.
  const round = interview.round ?? 'L2_TECHNICAL';
  return (
    <Badge variant={round === 'L3_BEHAVIORAL' ? 'secondary' : 'info'} size="sm">
      {roundLabelOf(interview)}
    </Badge>
  );
}

function WarningsCell({ interview }: Readonly<{ interview: InterviewSchedule }>) {
  const count = warningCountOf(interview);
  if (count === 0) return <span className="text-sm text-[var(--textTertiary)]">0</span>;
  return (
    <Badge variant={count >= 3 ? 'error' : 'warning'} size="sm">
      {count}
    </Badge>
  );
}

function CompletionCell({ interview }: Readonly<{ interview: InterviewSchedule }>) {
  if (!interview.completionReason) {
    return <span className="text-sm text-[var(--textTertiary)]">--</span>;
  }
  return (
    <Badge variant={getCompletionReasonVariant(interview.completionReason)} size="sm">
      {getCompletionReasonLabel(interview.completionReason)}
    </Badge>
  );
}

function RecommendationCell({ interview }: Readonly<{ interview: InterviewSchedule }>) {
  const recommendation = interview.evaluation?.recommendation;
  if (!recommendation) return <span className="text-sm text-[var(--textTertiary)]">--</span>;
  return (
    <Badge variant={getRecommendationVariant(recommendation)} size="sm">
      {recommendation.replace(/_/g, ' ')}
    </Badge>
  );
}

function InterviewActions({
  interview,
  onViewDetail,
}: Readonly<{ interview: InterviewSchedule; onViewDetail: (i: InterviewSchedule) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Offered whatever the status. This was gated on COMPLETED, so a row
          that was in progress or never attended had an empty Actions cell and
          no way in — even though the transcript of what had been asked so far
          was sitting there to be read. The detail view already copes with a
          missing evaluation. */}
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        leftIcon={<Eye size={14} />}
        onClick={() => onViewDetail(interview)}
      >
        View
      </Button>
      {interview.recordReferences && (
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          leftIcon={<ExternalLink size={14} />}
          onClick={() => window.open(interview.recordReferences, '_blank')}
        >
          Recording
        </Button>
      )}
    </div>
  );
}

function formatDuration(startedAt?: string, endedAt?: string): string {
  if (!startedAt || !endedAt) return '--';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return '<1 min';
  return `${minutes} min`;
}

export function InterviewResultsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = usePersistentState('interviewResults:selectedPrefix', '');
  // Deliberately not persisted, unlike the job. A filter that survives a reload
  // hides rows the reviewer never chose to hide on this visit; the job is the
  // thing worth remembering.
  const [roundFilter, setRoundFilter] = useState<RoundFilter>('ALL');
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [stats, setStats] = useState<InterviewStats | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedPrefix) {
      fetchResults();
      fetchStats();
    } else {
      setInterviews([]);
      setStats(null);
    }
  }, [selectedPrefix, roundFilter]);

  async function fetchJobs() {
    setLoadingJobs(true);
    try {
      const res = await jobService.getAllJobs();
      setJobs(res.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingJobs(false);
    }
  }

  const roundOrUndefined = roundFilter === 'ALL' ? undefined : roundFilter;
  // With one round selected the column would repeat the same value on every
  // row, so it is dropped and named once in the card header instead.
  const showRound = roundFilter === 'ALL';
  const columnWidths = showRound ? COLUMN_WIDTHS.withRound : COLUMN_WIDTHS.withoutRound;

  async function fetchResults() {
    if (!selectedPrefix) return;
    setLoadingResults(true);
    try {
      const res = await interviewService.getResults(selectedPrefix, roundOrUndefined);
      setInterviews(res.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingResults(false);
    }
  }

  async function fetchStats() {
    if (!selectedPrefix) return;
    try {
      // Same filter as the results call, so the cards describe the rows below.
      const res = await interviewService.getStats(selectedPrefix, roundOrUndefined);
      setStats(res.data);
    } catch {
      // Stats are optional
    }
  }

  /**
   * Open one candidate's rounds as a page.
   *
   * A dialog was the wrong container: a round carries a full transcript, scores
   * across seven areas and its proctoring events, and a reviewer needs to link
   * to that and come back to it.
   */
  /**
   * Open a candidate's interview result.
   *
   * Everything here leads to the same page. The row's View button used to open
   * a dialog instead, so the same result had two presentations — and the dialog
   * could show neither a full transcript nor the per-area scores without
   * scrolling a box inside a box.
   */
  function openCandidateResult(email: string) {
    navigate(ROUTES.ADMIN.interviewResultDetail(selectedPrefix, email));
  }

  // CSV Export
  const handleExportCSV = useCallback(() => {
    if (interviews.length === 0) return;

    // Round is a column even when the view is filtered to one: an exported file
    // outlives the screen's filter state, and a reader opening it later cannot
    // otherwise tell which interview the numbers came from.
    const headers = ['Email', 'Round', 'Status', 'Result', 'Completion Reason', 'Score', 'Warnings', 'Duration', 'Assigned', 'Deadline'];
    const rows = interviews.map((i) => [
      i.email,
      roundLabelOf(i),
      i.attemptStatus,
      i.interviewResult,
      getCompletionReasonLabel(i.completionReason),
      i.evaluation?.overallScore?.toFixed(1) ?? '',
      i.warningCount ?? i.proctoringWarnings ?? 0,
      formatDuration(i.startedAt, i.endedAt),
      i.assignedAt ? new Date(i.assignedAt).toLocaleDateString() : '',
      i.deadlineTime ? new Date(i.deadlineTime).toLocaleDateString() : '',
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const roundSlug = roundFilter === 'ALL' ? '' : `-${roundFilter.toLowerCase()}`;
    link.download = `interview-results-${selectedPrefix}${roundSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [interviews, selectedPrefix, roundFilter]);

  const jobOptions = [
    { value: '', label: 'Select a job' },
    ...jobs.map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobPrefix})` })),
  ];

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Interview Results</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Review AI interview results, evaluation scores, and recordings for each job
        </p>
      </div>

      {/* Job Selector */}
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <Select
              label="Select Job"
              options={jobOptions}
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />
            <Select
              label="Round"
              options={ROUND_FILTER_OPTIONS}
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
              disabled={!selectedPrefix}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      {stats && selectedPrefix && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.totalInterviews}</p>
                  <p className="text-xs text-[var(--textSecondary)]">Total Interviews</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <TrendingUp size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.passRate}%</p>
                  <p className="text-xs text-[var(--textSecondary)]">Pass Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Award size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.avgScore}/10</p>
                  <p className="text-xs text-[var(--textSecondary)]">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.avgDurationMinutes}m</p>
                  <p className="text-xs text-[var(--textSecondary)]">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {selectedPrefix && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Video size={20} className="text-[var(--primary)]" />
                <CardTitle>Results ({interviews.length})</CardTitle>
                {/* Named here rather than in a column: with a round selected
                    every row carries the same one, so it belongs to the whole
                    table, not to each line of it. */}
                {roundFilter !== 'ALL' && (
                  <Badge variant={roundFilter === 'L3_BEHAVIORAL' ? 'secondary' : 'info'} size="sm">
                    {INTERVIEW_ROUND_LABELS[roundFilter]}
                  </Badge>
                )}
              </div>
              {interviews.length > 0 && (
                <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={handleExportCSV}>
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingResults ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
              </div>
            ) : interviews.length === 0 ? (
              <EmptyState
                icon={<Video size={48} />}
                title="No interview results"
                description={
                  roundFilter === 'ALL'
                    ? 'No interviews have been conducted for this job yet.'
                    : `No ${INTERVIEW_ROUND_LABELS[roundFilter]} interviews for this job yet. Choose "All rounds" to see the others.`
                }
              />
            ) : (
              <>
                {/* Mobile: one card per interview. Nine columns is far past what
                    a phone can show, and the score and recommendation — the two
                    things this page exists to convey — were the first to be
                    pushed off the right edge. */}
                <div className="xl:hidden space-y-3">
                  {interviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => openCandidateResult(interview.email)}
                          className="min-w-0 break-all text-left font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                        >
                          {interview.email}
                        </button>
                        <div className="flex-shrink-0">
                          <ScoreCell interview={interview} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {showRound && <RoundCell interview={interview} />}
                        <Badge variant={getStatusVariant(interview.attemptStatus)} size="sm">
                          {interview.attemptStatus.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant={getResultVariant(interview.interviewResult)} size="sm">
                          {interview.interviewResult}
                        </Badge>
                        <CompletionCell interview={interview} />
                      </div>

                      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Duration</dt>
                          <dd className="text-sm text-[var(--textSecondary)]">
                            {formatDuration(interview.startedAt, interview.endedAt)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Warnings</dt>
                          <dd>
                            <WarningsCell interview={interview} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--textTertiary)] mb-0.5">
                            Recommendation
                          </dt>
                          <dd>
                            <RecommendationCell interview={interview} />
                          </dd>
                        </div>
                      </dl>

                      <InterviewActions interview={interview} onViewDetail={(row) => openCandidateResult(row.email)} />
                    </div>
                  ))}
                </div>

                {/* Desktop: fixed layout so the email column wraps instead of
                    stretching the table past the card. */}
                <div className="hidden xl:block">
                  {/* min-width so the columns keep their sizes and the card
                      scrolls, instead of squeezing headers until they collide.
                      Table already provides the overflow-x container. */}
                  <Table className="table-fixed" style={{ minWidth: TABLE_MIN_WIDTH }}>
                    <TableHeader>
                      <TableRow>
                        <TableHead style={{ width: columnWidths.candidate }}>Candidate</TableHead>
                        {showRound && (
                          <TableHead style={{ width: columnWidths.round }}>Round</TableHead>
                        )}
                        <TableHead style={{ width: columnWidths.status }}>Status</TableHead>
                        <TableHead style={{ width: columnWidths.result }}>Result</TableHead>
                        <TableHead style={{ width: columnWidths.score }}>Score</TableHead>
                        <TableHead style={{ width: columnWidths.duration }}>Duration</TableHead>
                        <TableHead style={{ width: columnWidths.warnings }}>Warnings</TableHead>
                        <TableHead style={{ width: columnWidths.completion }}>Completion</TableHead>
                        <TableHead style={{ width: columnWidths.recommendation }}>Recommendation</TableHead>
                        <TableHead style={{ width: columnWidths.actions }}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interviews.map((interview) => (
                        <TableRow key={interview.id}>
                          <TableCell className="font-medium align-top break-all">
                            <button
                              type="button"
                              onClick={() => openCandidateResult(interview.email)}
                              className="text-left text-[var(--primary)] underline-offset-2 hover:underline"
                              title="See this candidate's rounds"
                            >
                              {interview.email}
                            </button>
                          </TableCell>
                          {showRound && (
                            <TableCell className="align-top">
                              <RoundCell interview={interview} />
                            </TableCell>
                          )}
                          <TableCell className="align-top">
                            <Badge variant={getStatusVariant(interview.attemptStatus)} size="sm">
                              {interview.attemptStatus.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant={getResultVariant(interview.interviewResult)} size="sm">
                              {interview.interviewResult}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <ScoreCell interview={interview} />
                          </TableCell>
                          <TableCell className="align-top text-[var(--textSecondary)]">
                            {formatDuration(interview.startedAt, interview.endedAt)}
                          </TableCell>
                          <TableCell className="align-top">
                            <WarningsCell interview={interview} />
                          </TableCell>
                          <TableCell className="align-top">
                            <CompletionCell interview={interview} />
                          </TableCell>
                          <TableCell className="align-top">
                            <RecommendationCell interview={interview} />
                          </TableCell>
                          <TableCell className="align-top">
                            <InterviewActions
                              interview={interview}
                              onViewDetail={(row) => openCandidateResult(row.email)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
