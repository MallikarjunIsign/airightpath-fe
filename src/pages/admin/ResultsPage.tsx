import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  FileBarChart,
  ClipboardList,
  Eye,
  CheckCircle,
  XCircle,
  Code2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobService } from '@/services/job.service';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import { usePersistentState } from '@/hooks/usePersistentState';
import {
  aptitudeScorePercent,
  codingScorePercent,
  overallScorePercent,
  buildCodingRows,
  scoreColor,
} from '@/utils/result.utils';
import type { JobPostDTO } from '@/types/job.types';
import type { RawCodingQuestion } from '@/types/assessment.types';
import type { Result, AptitudeAnswer, CodingAnswer } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

/** Results/answers are stored as a JSON string on the result row. */
function parseAnswers<T>(raw?: string): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// ── Aggregated candidate row ─────────────────────────────────────────
interface CandidateRow {
  email: string;
  aptitudeResult?: Result;
  codingResult?: Result;
  codeSubmissions: CodeSubmissionResponse[];
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  /** Percentages derived per module — `Result.score` is marks, not a percent. */
  aptitudeScore: number | null;
  codingScore: number | null;
  overallScore: number | null;
}

export function ResultsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = usePersistentState('results:selectedPrefix', '');
  const [results, setResults] = useState<Result[]>([]);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmissionResponse[]>([]);
  /** The job's coding paper; null until loaded, and null if it could not be. */
  const [codingPaper, setCodingPaper] = useState<RawCodingQuestion[] | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedPrefix) {
      fetchResults();
    } else {
      setResults([]);
      setCodeSubmissions([]);
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
      const [resultsRes, codeRes] = await Promise.all([
        assessmentService.getResultsByJobPrefix(selectedPrefix),
        compilerService.getResultsByJobPrefix(selectedPrefix),
      ]);
      const rows = resultsRes.data ?? [];
      setResults(rows);
      setCodeSubmissions(codeRes.data ?? []);
      void fetchCodingPaper(rows);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingResults(false);
    }
  }

  /**
   * The coding paper for this job, needed only for its test-case count.
   *
   * Without it the score's denominator collapses to the tests the candidate
   * happened to run, so someone who passed 5 of 30 cases scored 5/5 = 100% here
   * while their own detail page said 17%. The number an admin shortlists on has
   * to be the same one on both screens.
   *
   * Fetched once, from the first candidate who has a coding assessment, because
   * every candidate on a job sits the same paper. That assumption is verified
   * per row before the paper is used — see `paperMatches` below — so a job where
   * it does not hold degrades to "no score" rather than to a wrong score.
   */
  async function fetchCodingPaper(rows: Result[]) {
    setCodingPaper(null);
    const email = rows.find((r) => r.assessmentType === 'CODING')?.candidateEmail;
    if (!email) return;

    try {
      const assessments = await assessmentService.getAllAssessmentsForCandidate(email);
      const coding = (assessments.data ?? []).find(
        (a) => a.assessmentType === 'CODING' && a.jobPrefix === selectedPrefix,
      );
      if (!coding?.id) return;

      const paper = await assessmentService.fetchQuestions(coding.id);
      setCodingPaper(parseAnswers<RawCodingQuestion>(paper.data?.questions));
    } catch {
      // Best effort. A missing paper costs the coding column its percentage,
      // which is the honest outcome — never a number derived from a guess.
    }
  }

  // ── Aggregate results into per-candidate rows ────────────────────────
  const candidateRows: CandidateRow[] = useMemo(() => {
    const map = new Map<string, CandidateRow>();

    const blankRow = (email: string): CandidateRow => ({
      email,
      codeSubmissions: [],
      overallStatus: 'PARTIAL',
      aptitudeScore: null,
      codingScore: null,
      overallScore: null,
    });

    for (const r of results) {
      if (!map.has(r.candidateEmail)) {
        map.set(r.candidateEmail, blankRow(r.candidateEmail));
      }
      const row = map.get(r.candidateEmail)!;
      if (r.assessmentType === 'APTITUDE') {
        row.aptitudeResult = r;
      } else if (r.assessmentType === 'CODING') {
        row.codingResult = r;
      }
    }

    // Attach code submissions
    for (const cs of codeSubmissions) {
      const email = cs.userEmail ?? '';
      if (!map.has(email)) {
        map.set(email, blankRow(email));
      }
      map.get(email)!.codeSubmissions.push(cs);
    }

    // Compute overall status and the module percentages
    for (const row of map.values()) {
      const aptStatus = row.aptitudeResult?.status;
      const codStatus = row.codingResult?.status;
      if (aptStatus === 'PASSED' && codStatus === 'PASSED') {
        row.overallStatus = 'PASSED';
      } else if (aptStatus === 'FAILED' || codStatus === 'FAILED') {
        row.overallStatus = 'FAILED';
      } else {
        row.overallStatus = 'PARTIAL';
      }

      // Aptitude ships raw marks and coding ships 0, so both are re-derived
      // here with the same helpers the result detail page uses — and, now, the
      // same question paper, without which the two could not agree.
      const aptitudeAnswers = parseAnswers<AptitudeAnswer>(row.aptitudeResult?.resultsJson);
      const codingAnswers = parseAnswers<CodingAnswer>(row.codingResult?.resultsJson);

      // The stored result holds one entry per question on the paper, so a
      // matching length is good evidence this candidate sat the paper we
      // fetched. If it does not match, the denominator is unknown and no
      // percentage is better than a wrong one.
      const paperMatches =
        codingPaper !== null && codingPaper.length > 0 && codingPaper.length === codingAnswers.length;

      const codingRows = buildCodingRows(
        paperMatches ? codingPaper : [],
        row.codeSubmissions,
        codingAnswers,
      );
      row.aptitudeScore = aptitudeScorePercent(row.aptitudeResult, aptitudeAnswers);
      row.codingScore = paperMatches ? codingScorePercent(codingRows, row.codingResult) : null;
      row.overallScore = overallScorePercent([row.aptitudeScore, row.codingScore]);
    }

    return Array.from(map.values());
  }, [results, codeSubmissions, codingPaper]);

  // ── Summary stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = candidateRows.length;
    const passed = candidateRows.filter((r) => r.overallStatus === 'PASSED').length;
    const failed = candidateRows.filter((r) => r.overallStatus === 'FAILED').length;
    const partial = total - passed - failed;
    return { total, passed, failed, partial };
  }, [candidateRows]);

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
        <h1 className="text-3xl font-bold text-[var(--text)]">Assessment Results</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          View assessment scores and code submissions for candidates by job
        </p>
      </div>

      {/* Job Selector */}
      <Card>
        <CardContent>
          <div className="max-w-md">
            <Select
              label="Select Job"
              options={jobOptions}
              searchable
              searchPlaceholder="Search by job title or prefix..."
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {selectedPrefix && (
        <>
          {/* Summary Statistics */}
          {!loadingResults && candidateRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Candidates" value={stats.total} color="var(--primary)" />
              <StatCard label="All Passed" value={stats.passed} color="#22c55e" />
              <StatCard label="Failed" value={stats.failed} color="#ef4444" />
              <StatCard label="Pending" value={stats.partial} color="#f59e0b" />
            </div>
          )}

          {/* Results Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileBarChart size={20} className="text-[var(--primary)]" />
                <CardTitle>Candidate Results</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loadingResults ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : candidateRows.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList size={48} />}
                  title="No assessment results"
                  description="No assessments have been completed for this job yet."
                />
              ) : (
                <>
                  {/* Mobile: one card per candidate. Six columns — one of them a
                      full email address — cannot be read on a phone, and the
                      overall score matters more than any of them, so it leads. */}
                  <div className="lg:hidden space-y-3">
                    {candidateRows.map((row) => (
                      <div
                        key={row.email}
                        className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-[var(--text)] break-all min-w-0">
                            {row.email}
                          </p>
                          <OverallScore row={row} className="flex-shrink-0" />
                        </div>

                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                          <div className="min-w-0">
                            <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Aptitude</dt>
                            <dd>
                              <AptitudeCell row={row} />
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Coding</dt>
                            <dd>
                              <CodingCell row={row} />
                            </dd>
                          </div>
                        </dl>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-sm text-[var(--textSecondary)]">
                            {getSubmittedDate(row)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye size={14} />}
                            onClick={() =>
                              navigate(
                                `/admin/assessments/results/${selectedPrefix}/${encodeURIComponent(row.email)}`
                              )
                            }
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: fixed layout so the email column wraps instead of
                      stretching the table past the card. */}
                  <div className="hidden lg:block">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[28%]">Candidate Email</TableHead>
                          <TableHead className="w-[15%]">Aptitude</TableHead>
                          <TableHead className="w-[16%]">Coding</TableHead>
                          <TableHead className="w-[17%]">Overall</TableHead>
                          <TableHead className="w-[12%]">Submitted</TableHead>
                          <TableHead className="w-[12%]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidateRows.map((row) => (
                          <TableRow key={row.email}>
                            <TableCell className="font-medium align-top break-all">
                              {row.email}
                            </TableCell>
                            <TableCell className="align-top">
                              <AptitudeCell row={row} />
                            </TableCell>
                            <TableCell className="align-top">
                              <CodingCell row={row} />
                            </TableCell>
                            <TableCell className="align-top">
                              <OverallScore row={row} />
                            </TableCell>
                            <TableCell className="align-top text-sm text-[var(--textSecondary)]">
                              {getSubmittedDate(row)}
                            </TableCell>
                            <TableCell className="align-top">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                leftIcon={<Eye size={14} />}
                                onClick={() =>
                                  navigate(
                                    `/admin/assessments/results/${selectedPrefix}/${encodeURIComponent(row.email)}`
                                  )
                                }
                              >
                                View
                              </Button>
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
        </>
      )}

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-[var(--textSecondary)]">{label}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// The three value cells, shared by the desktop row and the mobile card so the
// two renderings cannot drift apart.

function AptitudeCell({ row }: { row: CandidateRow }) {
  if (!row.aptitudeResult) {
    return <span className="text-[var(--textTertiary)] text-sm">--</span>;
  }
  const { score, totalMarks } = row.aptitudeResult;
  return (
    <ScoreBadge
      score={row.aptitudeScore}
      status={row.aptitudeResult.status}
      detail={`${score}${totalMarks ? `/${totalMarks}` : ''} marks`}
    />
  );
}

function CodingCell({ row }: { row: CandidateRow }) {
  if (!row.codingResult && row.codeSubmissions.length === 0) {
    return <span className="text-[var(--textTertiary)] text-sm">--</span>;
  }
  return (
    <div className="space-y-0.5">
      <ScoreBadge score={row.codingScore} status={row.codingResult?.status} />
      <CodingSubmissionSummary submissions={row.codeSubmissions} />
    </div>
  );
}

function OverallScore({ row, className = '' }: { row: CandidateRow; className?: string }) {
  let variant: 'success' | 'error' | 'warning' = 'warning';
  if (row.overallStatus === 'PASSED') variant = 'success';
  else if (row.overallStatus === 'FAILED') variant = 'error';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="text-sm font-bold tabular-nums"
        style={{
          color: row.overallScore === null ? 'var(--textTertiary)' : scoreColor(row.overallScore),
        }}
      >
        {row.overallScore === null ? '--' : `${row.overallScore}%`}
      </span>
      <Badge variant={variant} size="sm">
        {row.overallStatus === 'PARTIAL' ? 'Pending' : row.overallStatus}
      </Badge>
    </div>
  );
}

function ScoreBadge({
  score,
  status,
  detail,
}: {
  /** Percentage, or null when the module cannot be scored. */
  score: number | null;
  status?: string;
  detail?: string;
}) {
  const isPassed = status === 'PASSED';
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {isPassed ? (
          <CheckCircle size={14} className="text-green-500" />
        ) : (
          <XCircle size={14} className="text-red-500" />
        )}
        <span className={`text-sm font-semibold ${isPassed ? 'text-green-600' : 'text-red-600'}`}>
          {score === null ? '--' : `${score}%`}
        </span>
      </div>
      {detail && <p className="text-xs text-[var(--textTertiary)] ml-5">{detail}</p>}
    </div>
  );
}

function CodingSubmissionSummary({ submissions }: { submissions: CodeSubmissionResponse[] }) {
  const totalTests = submissions.reduce((sum, s) => sum + (s.testResults?.length ?? 0), 0);
  if (totalTests === 0) return null;

  const passedTests = submissions.reduce(
    (sum, s) => sum + (s.testResults?.filter((t) => t.passed).length ?? 0),
    0
  );
  const allPassed = passedTests === totalTests;

  return (
    <div className="flex items-center gap-1.5">
      {allPassed ? (
        <CheckCircle size={12} className="text-green-500" />
      ) : (
        <Code2 size={12} className="text-amber-500" />
      )}
      <span className="text-xs text-[var(--textTertiary)]">
        {passedTests}/{totalTests} tests
      </span>
    </div>
  );
}

function getSubmittedDate(row: CandidateRow): string {
  const date =
    row.aptitudeResult?.submittedAt ?? row.codingResult?.submittedAt ?? row.aptitudeResult?.createdAt;
  if (!date) return '--';
  return new Date(date).toLocaleDateString();
}
