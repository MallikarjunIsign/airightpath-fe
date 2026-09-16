import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Video,
  ExternalLink,
  Eye,
  Mic2,
  BarChart3,
  Download,
  Users,
  TrendingUp,
  Clock,
  Award,
  MessageSquare,
  Shield,
  Play,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { EvaluationBreakdown } from '@/components/interview/EvaluationBreakdown';
import { CodeBlock } from '@/components/interview/CodeBlock';
import { jobService } from '@/services/job.service';
import { interviewService, type VoiceConversationEntryDTO } from '@/services/interview.service';
import { aiService } from '@/services/ai.service';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { JobPostDTO } from '@/types/job.types';
import type { InterviewSchedule, VoiceEvaluationResult, ProctoringEvent, InterviewStats, CompletionReason, InterviewRound } from '@/types/interview.types';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';

/**
 * Widths for the fixed-layout table, in two sets.
 *
 * The Round column only appears in the all-rounds view, so the other columns
 * have to give up room for it — and `table-fixed` will not work that out on its
 * own. Kept as values rather than Tailwind `w-[..]` classes because Tailwind
 * only emits classes it can see in the source, never ones built at runtime.
 */
const COLUMN_WIDTHS = {
  withRound: {
    candidate: '16%', round: '12%', status: '9%', result: '8%', score: '7%',
    duration: '7%', warnings: '6%', completion: '11%', recommendation: '11%', actions: '13%',
  },
  withoutRound: {
    // `round` is never read here — the column is not rendered — but both sets
    // need the same keys for the lookup below to typecheck.
    candidate: '19%', round: '0', status: '10%', result: '9%', score: '8%',
    duration: '8%', warnings: '8%', completion: '12%', recommendation: '12%', actions: '14%',
  },
} as const;

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
      {interview.attemptStatus === 'COMPLETED' && (
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          leftIcon={<Eye size={14} />}
          onClick={() => onViewDetail(interview)}
        >
          Detail
        </Button>
      )}
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

  // Detail modal state
  const [selectedInterview, setSelectedInterview] = useState<InterviewSchedule | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<InterviewSchedule | null>(null);
  const [voiceEvaluation, setVoiceEvaluation] = useState<VoiceEvaluationResult | null>(null);
  const [conversationEntries, setConversationEntries] = useState<VoiceConversationEntryDTO[]>([]);
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'evaluation' | 'conversation' | 'proctoring' | 'recording'>('evaluation');

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

  async function handleViewDetail(interview: InterviewSchedule) {
    setSelectedInterview(interview);
    setDetailData(null);
    setVoiceEvaluation(null);
    setConversationEntries([]);
    setProctoringEvents([]);
    setActiveTab('evaluation');
    setLoadingDetail(true);

    try {
      const res = await interviewService.getResultDetail(interview.id);
      setDetailData(res.data);
    } catch {
      setDetailData(interview);
    }

    // Fetch voice evaluation, conversation, proctoring events in parallel
    const [evalRes, convRes, procRes] = await Promise.allSettled([
      aiService.getVoiceEvaluation(interview.id),
      interviewService.getConversation(interview.id),
      interviewService.getProctoringEvents(interview.id),
    ]);

    if (evalRes.status === 'fulfilled') setVoiceEvaluation(evalRes.value.data);
    if (convRes.status === 'fulfilled') setConversationEntries(convRes.value.data ?? []);
    if (procRes.status === 'fulfilled') setProctoringEvents(procRes.value.data ?? []);

    setLoadingDetail(false);
  }

  function closeDetailModal() {
    setSelectedInterview(null);
    setDetailData(null);
    setVoiceEvaluation(null);
    setConversationEntries([]);
    setProctoringEvents([]);
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
                        <p className="font-medium text-[var(--text)] break-all min-w-0">
                          {interview.email}
                        </p>
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

                      <InterviewActions interview={interview} onViewDetail={handleViewDetail} />
                    </div>
                  ))}
                </div>

                {/* Desktop: fixed layout so the email column wraps instead of
                    stretching the table past the card. */}
                <div className="hidden xl:block">
                  <Table className="table-fixed">
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
                            {interview.email}
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
                              onViewDetail={handleViewDetail}
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

      {/* Tabbed Detail Modal */}
      <Modal
        isOpen={!!selectedInterview}
        onClose={closeDetailModal}
        title={`Interview Detail — ${selectedInterview?.email ?? ''}`}
        size="lg"
      >
        {loadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Which interview this was. The modal title carries the candidate,
                and a score means something different in a behavioural round
                than a technical one, so the round has to travel with it. */}
            {(detailData ?? selectedInterview) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--textSecondary)]">Round</span>
                <RoundCell interview={(detailData ?? selectedInterview)!} />
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              {[
                { key: 'evaluation', label: 'Evaluation', icon: <BarChart3 size={14} /> },
                { key: 'conversation', label: 'Conversation', icon: <MessageSquare size={14} /> },
                { key: 'proctoring', label: 'Proctoring', icon: <Shield size={14} /> },
                { key: 'recording', label: 'Recording', icon: <Play size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-[var(--primary)] text-[var(--primary)]'
                      : 'border-transparent text-[var(--textSecondary)] hover:text-[var(--text)]'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.key === 'proctoring' && proctoringEvents.length > 0 && (
                    <span className="ml-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full px-1.5">
                      {proctoringEvents.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Early termination banner */}
            {detailData?.completionReason === 'EARLY_TERMINATION_POOR_PERFORMANCE' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-200">
                  This interview was terminated early due to consistently poor candidate performance (frequent skips, short answers, or low confidence).
                </p>
              </div>
            )}

            {/* Tab 1: Evaluation */}
            {activeTab === 'evaluation' && (
              <div className="space-y-6">
                {voiceEvaluation ? (
                  <>
                    {/* Overall Score */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface1)]">
                      <div>
                        <p className="text-sm text-[var(--textSecondary)]">Overall Score</p>
                        <p className="text-3xl font-bold text-[var(--text)]">
                          {(voiceEvaluation.overallScore ?? 0).toFixed(1)}
                          <span className="text-base text-[var(--textTertiary)]">/10</span>
                        </p>
                      </div>
                      {voiceEvaluation.recommendation && (
                        <Badge
                          variant={
                            voiceEvaluation.recommendation === 'STRONG_HIRE' || voiceEvaluation.recommendation === 'HIRE'
                              ? 'success'
                              : voiceEvaluation.recommendation === 'NO_HIRE'
                                ? 'warning'
                                : 'error'
                          }
                          size="lg"
                        >
                          {voiceEvaluation.recommendation.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>

                    {/* Summary */}
                    {voiceEvaluation.summary && (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
                          <BarChart3 size={14} />
                          Summary
                        </h4>
                        <p className="text-sm text-[var(--textSecondary)] leading-relaxed">{voiceEvaluation.summary}</p>
                      </div>
                    )}

                    {/* Category Scores */}
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Category Scores</h4>
                      <div className="space-y-2">
                        {voiceEvaluation.categoryScores.map((cat, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-[var(--textSecondary)]">{cat.category}</span>
                              <span className="text-xs font-semibold text-[var(--text)]">{cat.score}/10</span>
                            </div>
                            <div className="w-full h-1.5 bg-[var(--surface1)] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  cat.score >= 7 ? 'bg-emerald-500' : cat.score >= 5 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(cat.score / 10) * 100}%` }}
                              />
                            </div>
                            {cat.feedback && (
                              <p className="text-xs text-[var(--textTertiary)] mt-1">{cat.feedback}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Speech Analysis */}
                    {voiceEvaluation.speechAnalysis && (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                          <Mic2 size={14} />
                          Speech Analysis
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-2 rounded-lg bg-[var(--surface1)]">
                            <p className="text-lg font-bold text-[var(--text)]">
                              {Math.round(voiceEvaluation.speechAnalysis.averageWordsPerMinute)}
                            </p>
                            <p className="text-xs text-[var(--textTertiary)]">WPM</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-[var(--surface1)]">
                            <p className="text-lg font-bold text-[var(--text)]">
                              {voiceEvaluation.speechAnalysis.totalFillerWords}
                            </p>
                            <p className="text-xs text-[var(--textTertiary)]">Fillers</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-[var(--surface1)]">
                            <p className="text-lg font-bold text-[var(--text)]">
                              {Math.round(voiceEvaluation.speechAnalysis.confidenceScore)}%
                            </p>
                            <p className="text-xs text-[var(--textTertiary)]">Confidence</p>
                          </div>
                        </div>
                        {voiceEvaluation.speechAnalysis.paceAssessment && (
                          <p className="text-xs text-[var(--textSecondary)] mt-2">
                            <strong>Pace:</strong> {voiceEvaluation.speechAnalysis.paceAssessment}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Strengths & Areas for Improvement */}
                    <div className="grid grid-cols-2 gap-4">
                      {voiceEvaluation.strengths?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">Strengths</h4>
                          <ul className="space-y-1">
                            {voiceEvaluation.strengths.map((s, i) => (
                              <li key={i} className="text-xs text-[var(--textSecondary)] flex items-start gap-1">
                                <span className="text-emerald-500">+</span> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {voiceEvaluation.areasForImprovement?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">Areas for Improvement</h4>
                          <ul className="space-y-1">
                            {voiceEvaluation.areasForImprovement.map((a, i) => (
                              <li key={i} className="text-xs text-[var(--textSecondary)] flex items-start gap-1">
                                <span className="text-amber-500">-</span> {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </>
                ) : detailData?.evaluation ? (
                  <EvaluationBreakdown evaluation={detailData.evaluation} />
                ) : (
                  <p className="text-sm text-[var(--textSecondary)]">
                    No evaluation data available for this interview.
                  </p>
                )}
              </div>
            )}

            {/* Tab 2: Conversation */}
            {activeTab === 'conversation' && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {conversationEntries.length === 0 ? (
                  <p className="text-sm text-[var(--textSecondary)] text-center py-8">
                    No conversation data available.
                  </p>
                ) : (
                  conversationEntries
                    .filter((e) => e.role !== 'SYSTEM')
                    .map((entry, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 ${
                          entry.role === 'CANDIDATE' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            entry.role === 'INTERVIEWER'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          }`}
                        >
                          {entry.role === 'INTERVIEWER' ? 'AI' : 'C'}
                        </div>
                        <div
                          className={`max-w-[75%] p-3 rounded-lg ${
                            entry.role === 'INTERVIEWER'
                              ? 'bg-[var(--surface1)] text-[var(--text)]'
                              : 'bg-[var(--primary)] text-white'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                          {entry.role === 'CANDIDATE' && entry.codeContent && (
                            <CodeBlock code={entry.codeContent} language={entry.codeLanguage} />
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs ${entry.role === 'INTERVIEWER' ? 'text-[var(--textTertiary)]' : 'text-white/60'}`}>
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            {entry.role === 'CANDIDATE' && entry.wordsPerMinute != null && (
                              <span className="text-xs text-white/60">
                                {Math.round(entry.wordsPerMinute)} WPM
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {/* Tab 3: Proctoring */}
            {activeTab === 'proctoring' && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {proctoringEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield size={32} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm text-[var(--textSecondary)]">No proctoring events recorded.</p>
                    <p className="text-xs text-[var(--textTertiary)]">This candidate had a clean session.</p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {proctoringEvents.length} proctoring event{proctoringEvents.length > 1 ? 's' : ''} recorded
                      </p>
                    </div>
                    <div className="relative pl-6">
                      {/* Timeline line */}
                      <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-[var(--border)]" />
                      {proctoringEvents.map((event, i) => (
                        <div key={i} className="relative mb-4">
                          {/* Timeline dot */}
                          <div className="absolute -left-3.5 top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-[var(--cardBg)]" />
                          <div className="p-3 rounded-lg bg-[var(--surface1)]">
                            <div className="flex items-center justify-between mb-1">
                              <Badge
                                variant={event.eventType === 'tab_switch' ? 'warning' : event.eventType === 'devtools' ? 'error' : 'info'}
                                size="sm"
                              >
                                {event.eventType.replace(/_/g, ' ')}
                              </Badge>
                              <span className="text-xs text-[var(--textTertiary)]">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            {event.details && (
                              <p className="text-xs text-[var(--textSecondary)]">{event.details}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tab 4: Recording */}
            {activeTab === 'recording' && (
              <div className="space-y-4">
                {detailData?.recordReferences ? (
                  <div className="space-y-4">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video
                        src={detailData.recordReferences}
                        controls
                        className="w-full h-full"
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<ExternalLink size={14} />}
                      onClick={() => window.open(detailData.recordReferences, '_blank')}
                    >
                      Open in New Tab
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Video size={32} className="mx-auto text-[var(--textTertiary)] mb-2" />
                    <p className="text-sm text-[var(--textSecondary)]">No recording available for this interview.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
