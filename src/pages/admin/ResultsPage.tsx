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
import type { JobPostDTO } from '@/types/job.types';
import type { Result } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

// ── Aggregated candidate row ─────────────────────────────────────────
interface CandidateRow {
  email: string;
  aptitudeResult?: Result;
  codingResult?: Result;
  codeSubmissions: CodeSubmissionResponse[];
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
}

export function ResultsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmissionResponse[]>([]);
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
      setResults(resultsRes.data ?? []);
      setCodeSubmissions(codeRes.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingResults(false);
    }
  }

  // ── Aggregate results into per-candidate rows ────────────────────────
  const candidateRows: CandidateRow[] = useMemo(() => {
    const map = new Map<string, CandidateRow>();

    for (const r of results) {
      if (!map.has(r.candidateEmail)) {
        map.set(r.candidateEmail, {
          email: r.candidateEmail,
          codeSubmissions: [],
          overallStatus: 'PARTIAL',
        });
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
        map.set(email, {
          email,
          codeSubmissions: [],
          overallStatus: 'PARTIAL',
        });
      }
      map.get(email)!.codeSubmissions.push(cs);
    }

    // Compute overall status
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
    }

    return Array.from(map.values());
  }, [results, codeSubmissions]);

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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate Email</TableHead>
                        <TableHead>Aptitude</TableHead>
                        <TableHead>Coding</TableHead>
                        <TableHead>Overall</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidateRows.map((row) => (
                        <TableRow key={row.email}>
                          <TableCell className="font-medium">{row.email}</TableCell>
                          <TableCell>
                            {row.aptitudeResult ? (
                              <ScoreBadge
                                score={row.aptitudeResult.score}
                                status={row.aptitudeResult.status}
                              />
                            ) : (
                              <span className="text-[var(--textTertiary)] text-sm">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.codingResult ? (
                              <ScoreBadge
                                score={row.codingResult.score}
                                status={row.codingResult.status}
                              />
                            ) : row.codeSubmissions.length > 0 ? (
                              <CodingSubmissionSummary submissions={row.codeSubmissions} />
                            ) : (
                              <span className="text-[var(--textTertiary)] text-sm">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.overallStatus === 'PASSED'
                                  ? 'success'
                                  : row.overallStatus === 'FAILED'
                                    ? 'error'
                                    : 'warning'
                              }
                              size="sm"
                            >
                              {row.overallStatus === 'PARTIAL' ? 'Pending' : row.overallStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-[var(--textSecondary)]">
                            {getSubmittedDate(row)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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

function ScoreBadge({ score, status }: { score: number; status?: string }) {
  const isPassed = status === 'PASSED';
  return (
    <div className="flex items-center gap-1.5">
      {isPassed ? (
        <CheckCircle size={14} className="text-green-500" />
      ) : (
        <XCircle size={14} className="text-red-500" />
      )}
      <span className={`text-sm font-semibold ${isPassed ? 'text-green-600' : 'text-red-600'}`}>
        {score}%
      </span>
    </div>
  );
}

function CodingSubmissionSummary({ submissions }: { submissions: CodeSubmissionResponse[] }) {
  const totalTests = submissions.reduce((sum, s) => sum + (s.testResults?.length ?? 0), 0);
  const passedTests = submissions.reduce(
    (sum, s) => sum + (s.testResults?.filter((t) => t.passed).length ?? 0),
    0
  );
  const allPassed = totalTests > 0 && passedTests === totalTests;

  return (
    <div className="flex items-center gap-1.5">
      {allPassed ? (
        <CheckCircle size={14} className="text-green-500" />
      ) : (
        <Code2 size={14} className="text-amber-500" />
      )}
      <span className="text-sm text-[var(--text)]">
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
