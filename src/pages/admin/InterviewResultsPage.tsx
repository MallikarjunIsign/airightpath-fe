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
import type { JobPostDTO } from '@/types/job.types';
import type { InterviewSchedule, VoiceEvaluationResult, ProctoringEvent, InterviewStats, CompletionReason } from '@/types/interview.types';

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
  const [selectedPrefix, setSelectedPrefix] = useState('');
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
  }, [selectedPrefix]);

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

  async function fetchResults() {
    if (!selectedPrefix) return;
    setLoadingResults(true);
    try {
      const res = await interviewService.getResults(selectedPrefix);
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
      const res = await interviewService.getStats(selectedPrefix);
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

    const headers = ['Email', 'Status', 'Result', 'Completion Reason', 'Score', 'Warnings', 'Duration', 'Assigned', 'Deadline'];
    const rows = interviews.map((i) => [
      i.email,
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
    link.download = `interview-results-${selectedPrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [interviews, selectedPrefix]);

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
          <div className="max-w-md">
            <Select
              label="Select Job"
              options={jobOptions}
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      {stats && selectedPrefix && (
        <div className="grid grid-cols-4 gap-4">
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
              <div className="flex items-center gap-2">
                <Video size={20} className="text-[var(--primary)]" />
                <CardTitle>Results ({interviews.length})</CardTitle>
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
                description="No interviews have been conducted for this job yet."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Warnings</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interviews.map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium">{interview.email}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(interview.attemptStatus)} size="sm">
                          {interview.attemptStatus.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getResultVariant(interview.interviewResult)} size="sm">
                          {interview.interviewResult}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {interview.evaluation?.overallScore != null ? (
                          <span className="font-semibold text-[var(--text)]">
                            {interview.evaluation.overallScore.toFixed(1)}/10
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--textTertiary)]">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-[var(--textSecondary)]">
                        {formatDuration(interview.startedAt, interview.endedAt)}
                      </TableCell>
                      <TableCell>
                        {(interview.warningCount ?? interview.proctoringWarnings ?? 0) > 0 ? (
                          <Badge variant={(interview.warningCount ?? interview.proctoringWarnings ?? 0) >= 3 ? 'error' : 'warning'} size="sm">
                            {interview.warningCount ?? interview.proctoringWarnings ?? 0}
                          </Badge>
                        ) : (
                          <span className="text-sm text-[var(--textTertiary)]">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {interview.completionReason ? (
                          <Badge variant={getCompletionReasonVariant(interview.completionReason)} size="sm">
                            {getCompletionReasonLabel(interview.completionReason)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-[var(--textTertiary)]">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {interview.evaluation?.recommendation ? (
                          <Badge
                            variant={
                              interview.evaluation.recommendation === 'STRONG_HIRE' || interview.evaluation.recommendation === 'HIRE'
                                ? 'success'
                                : interview.evaluation.recommendation === 'NO_HIRE'
                                  ? 'warning'
                                  : 'error'
                            }
                            size="sm"
                          >
                            {interview.evaluation.recommendation.replace(/_/g, ' ')}
                          </Badge>
                        ) : (
                          <span className="text-sm text-[var(--textTertiary)]">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {interview.attemptStatus === 'COMPLETED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Eye size={14} />}
                              onClick={() => handleViewDetail(interview)}
                            >
                              Detail
                            </Button>
                          )}
                          {interview.recordReferences && (
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<ExternalLink size={14} />}
                              onClick={() => window.open(interview.recordReferences, '_blank')}
                            >
                              Recording
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
