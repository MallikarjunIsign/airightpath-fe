import { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  FileSearch,
  Briefcase,
  Tag,
  Users,
  CheckCircle,
  XCircle,
  BarChart3,
  MapPin,
  Clock,
  TrendingUp,
  Search,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { BackLink } from '@/components/ui/BackLink';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { resumeService } from '@/services/resume.service';
import axios from 'axios';
import { useToast } from '@/components/ui/Toast';
import { usePersistentState } from '@/hooks/usePersistentState';
import { AtsCandidateDetailModal } from '@/components/admin/AtsCandidateDetailModal';
import { AtsResultsTable } from '@/components/admin/AtsResultsTable';
import { ScreeningRunReport } from '@/components/admin/ScreeningRunReport';
import { getAppEmail } from '@/utils/application.utils';
import { MESSAGES } from '@/config/messages';
import type { JobPostDTO, JobApplicationDTO, ScreeningRun } from '@/types/job.types';

type FilterTab = 'all' | 'shortlisted' | 'rejected';
type SortField = 'matchPercent' | 'firstName' | 'experience';
type SortDirection = 'asc' | 'desc';

export function AtsScreeningPage() {
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = usePersistentState('ats:selectedPrefix', '');
  const [selectedJob, setSelectedJob] = useState<JobPostDTO | null>(null);
  const [candidates, setCandidates] = useState<JobApplicationDTO[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [screening, setScreening] = useState(false);
  const [screened, setScreened] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  /** Report from the last screening run — per-candidate outcomes and counts. */
  const [run, setRun] = useState<ScreeningRun | null>(null);
  /** After a scoped run, show just those candidates until the admin widens it. */
  const [resultsView, setResultsView] = useState<'run' | 'all'>('all');
  const [activeTab, setActiveTab] = usePersistentState<FilterTab>('ats:activeTab', 'all');
  const [sortField, setSortField] = usePersistentState<SortField>('ats:sortField', 'matchPercent');
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>('ats:sortDirection', 'desc');
  const [searchQuery, setSearchQuery] = usePersistentState('ats:searchQuery', '');

  // Candidates ticked on the Candidates page before coming here. Screening
  // defaults to just these — the admin already said who they meant.
  const [scopeEmails, setScopeEmails] = usePersistentState<string[]>('ats:scopeEmails', []);
  const [scope, setScope] = useState<'all' | 'selected'>(
    scopeEmails.length > 0 ? 'selected' : 'all',
  );

  // Candidate detail modal
  const [selectedCandidate, setSelectedCandidate] = useState<JobApplicationDTO | null>(null);

  // Resume viewer
  const [resumeView, setResumeView] = useState<{ url: string; name: string } | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  // Revoke the blob URL when the resume viewer closes / on unmount.
  useEffect(() => {
    return () => {
      if (resumeView) URL.revokeObjectURL(resumeView.url);
    };
  }, [resumeView]);

  async function openResume(candidate: JobApplicationDTO) {
    const email = getAppEmail(candidate);
    if (!email) return;
    setResumeLoading(true);
    try {
      const res = await resumeService.view(email, { _skipErrorToast: true });
      const url = URL.createObjectURL(res.data);
      setResumeView({ url, name: candidate.resumeFileName || `${email}-resume.pdf` });
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      showToast(
        status === 400 || status === 404
          ? MESSAGES.admin.resume.unavailable
          : MESSAGES.admin.resume.openFailed,
        'error',
      );
    } finally {
      setResumeLoading(false);
    }
  }

  function closeResume() {
    setResumeView((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function downloadResume() {
    if (!resumeView) return;
    const a = document.createElement('a');
    a.href = resumeView.url;
    a.download = resumeView.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Re-derive the selected job from the persisted prefix once jobs load,
  // so the selection survives a page refresh.
  useEffect(() => {
    if (selectedPrefix && jobs.length > 0) {
      setSelectedJob(jobs.find((j) => j.jobPrefix === selectedPrefix) ?? null);
    }
  }, [jobs, selectedPrefix]);

  // Show what is already stored for the job on arrival. The read is safe now
  // that it no longer re-screens, so the page is useful before pressing
  // anything — including when the admin lands here from the Candidates page.
  useEffect(() => {
    if (selectedPrefix) loadStoredResults(selectedPrefix);
  }, [selectedPrefix]);

  async function fetchJobs() {
    setLoadingJobs(true);
    try {
      const res = await jobService.getAllJobs();
      setJobs(res.data ?? []);
    } catch {
      // Error toast auto-handled
    } finally {
      setLoadingJobs(false);
    }
  }

  function onJobSelected(prefix: string) {
    const changed = prefix !== selectedPrefix;
    setSelectedPrefix(prefix);
    const job = jobs.find((j) => j.jobPrefix === prefix) ?? null;
    setSelectedJob(job);
    setCandidates([]);
    setScreened(false);
    setRun(null);
    setResultsView('all');
    setActiveTab('all');
    setSearchQuery('');
    // A selection handed over for one job means nothing on another.
    if (changed) clearScope();
    // The [selectedPrefix] effect loads the stored results.
  }

  /** Reads what is stored for the job — no scoring, no status changes. */
  async function loadStoredResults(prefix: string) {
    setLoadingResults(true);
    try {
      const res = await jobApplicationService.getByPrefix(prefix);
      setCandidates(res.data ?? []);
    } catch {
      // Error toast auto-handled
    } finally {
      setLoadingResults(false);
    }
  }

  async function handleScreenCandidates() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    const screenSelectedOnly = scope === 'selected' && scopeEmails.length > 0;

    setScreening(true);
    setRun(null);
    try {
      // Passing emails screens only those; omitting them screens the whole job.
      const res = await jobApplicationService.screen({
        jobPrefix: selectedPrefix,
        ...(screenSelectedOnly ? { emails: scopeEmails } : {}),
      });
      const report = res.data;
      setRun(report ?? null);
      // Land on just-screened when the run was scoped; a job-wide run is
      // everyone anyway.
      setResultsView(report?.scope === 'SELECTED' ? 'run' : 'all');

      if (report) {
        showToast(
          report.message ||
            MESSAGES.admin.ats.screeningComplete(
              report.shortlistedCount,
              report.rejectedCount,
              report.screenedCount,
            ),
          report.screenedCount === 0 ? 'info' : 'success',
        );
      }

      // The report carries outcomes, not full applications — re-read for the
      // table so scores, resumes and statuses all come from stored data.
      await loadStoredResults(selectedPrefix);
      setScreened(true);
    } catch {
      // Error toast auto-handled by the interceptor (400/404/409 are explained
      // by the server's own message).
    } finally {
      setScreening(false);
    }
  }

  /** Drops the hand-off from the Candidates page and screens everyone instead. */
  function clearScope() {
    setScopeEmails([]);
    setScope('all');
  }

  /**
   * Emails touched by the last run, when that run was scoped. A job-wide run
   * covers everyone, so there is nothing to narrow down to.
   */
  const runEmails = useMemo(() => {
    if (!run || run.scope !== 'SELECTED') return null;
    return new Set((run.results ?? []).map((r) => r.email.toLowerCase()));
  }, [run]);

  /**
   * Straight after a scoped run the table shows just those candidates — the
   * admin asked to screen one person and wants to see what happened to them,
   * not the other applicants that the run deliberately left alone.
   */
  const visibleCandidates = useMemo(() => {
    if (resultsView !== 'run' || !runEmails) return candidates;
    return candidates.filter((c) => runEmails.has(getAppEmail(c).toLowerCase()));
  }, [candidates, runEmails, resultsView]);

  // Stats — describe whatever set is on screen.
  const stats = useMemo(() => {
    const list = visibleCandidates;
    const total = list.length;
    const shortlisted = list.filter((c) => c.status === 'SHORTLISTED').length;
    const rejected = list.filter((c) => c.status === 'REJECTED').length;
    const avgScore = total > 0
      ? list.reduce((sum, c) => sum + (c.matchPercent ?? 0), 0) / total
      : 0;
    const topScore = total > 0
      ? Math.max(...list.map((c) => c.matchPercent ?? 0))
      : 0;
    return { total, shortlisted, rejected, avgScore, topScore };
  }, [visibleCandidates]);

  // Filter + Search + Sort
  const filteredCandidates = useMemo(() => {
    let list = [...visibleCandidates];

    // Tab filter
    if (activeTab === 'shortlisted') {
      list = list.filter((c) => c.status === 'SHORTLISTED');
    } else if (activeTab === 'rejected') {
      list = list.filter((c) => c.status === 'REJECTED');
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          (c.email || c.userEmail || '').toLowerCase().includes(q) ||
          (c.jobRole || '').toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'matchPercent') {
        cmp = (a.matchPercent ?? 0) - (b.matchPercent ?? 0);
      } else if (sortField === 'firstName') {
        cmp = a.firstName.localeCompare(b.firstName);
      } else if (sortField === 'experience') {
        cmp = a.experience.localeCompare(b.experience);
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [visibleCandidates, activeTab, searchQuery, sortField, sortDirection]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  const jobOptions = [
    { value: '', label: 'Select a job to screen' },
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
      {/* Shown only when another screen sent us here */}
      <BackLink />

      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Screen with ATS</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Screen and shortlist candidates by matching their resumes against job requirements
        </p>
      </div>

      {/* Job Selection & Skills Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Selector */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase size={20} className="text-[var(--primary)]" />
              <CardTitle>Select Job</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select
                options={jobOptions}
                searchable
                searchPlaceholder="Search by job title or prefix..."
                value={selectedPrefix}
                onChange={(e) => onJobSelected(e.target.value)}
              />
              {selectedJob && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                    <MapPin size={14} />
                    <span>{selectedJob.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                    <Briefcase size={14} />
                    <span>{selectedJob.jobType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                    <Clock size={14} />
                    <span>{selectedJob.experience} experience</span>
                  </div>
                  {selectedJob.numberOfOpenings && (
                    <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Users size={14} />
                      <span>{selectedJob.numberOfOpenings} openings</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Key Skills */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag size={20} className="text-[var(--primary)]" />
              <CardTitle>Required Skills</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {selectedJob ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--textSecondary)]">
                  These skills will be matched against candidate resumes for ATS scoring:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedJob.keySkills.split(',').map((skill, idx) => (
                    <Badge key={idx} variant="secondary" size="md">
                      {skill.trim()}
                    </Badge>
                  ))}
                </div>
                {/* Who gets screened — spelled out, because screening writes
                    shortlist/reject statuses onto whoever it touches. */}
                <div className="rounded-xl border border-[var(--border)] p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--textTertiary)]">
                    Screen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setScope('all')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        scope === 'all'
                          ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primaryMuted,var(--primaryLight))]'
                          : 'border-[var(--border)] text-[var(--textSecondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      All applicants
                    </button>
                    <button
                      type="button"
                      disabled={scopeEmails.length === 0}
                      onClick={() => setScope('selected')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        scope === 'selected' && scopeEmails.length > 0
                          ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primaryMuted,var(--primaryLight))]'
                          : 'border-[var(--border)] text-[var(--textSecondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      Selected ({scopeEmails.length})
                    </button>
                    {scopeEmails.length > 0 && (
                      <button
                        type="button"
                        onClick={clearScope}
                        className="px-2 py-1.5 text-sm text-[var(--textTertiary)] hover:text-[var(--error)] transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {scopeEmails.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {scopeEmails.map((email) => (
                        <Badge key={email} variant="secondary" size="sm">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--textSecondary)]">
                      Tick candidates on the Candidates page and choose &ldquo;Screen with
                      ATS&rdquo; to screen only those.
                    </p>
                  )}

                  <p className="text-xs text-[var(--textSecondary)]">
                    {scope === 'selected' && scopeEmails.length > 0
                      ? `Only these ${scopeEmails.length} candidate${scopeEmails.length === 1 ? '' : 's'} will be scored and have their status updated.`
                      : 'Everyone still in the screening phase is re-scored, and their shortlist status overwritten. Candidates already past shortlisting are skipped.'}
                  </p>
                </div>

                <Button
                  onClick={handleScreenCandidates}
                  isLoading={screening}
                  leftIcon={!screening ? <BarChart3 size={18} /> : undefined}
                  className="w-full"
                  size="lg"
                >
                  {(() => {
                    if (screening) return 'Screening Candidates...';
                    if (scope === 'selected' && scopeEmails.length > 0) {
                      return `Screen ${scopeEmails.length} Selected Candidate${scopeEmails.length === 1 ? '' : 's'}`;
                    }
                    return 'Screen All Candidates';
                  })()}
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<FileSearch size={48} />}
                title="Select a job"
                description="Choose a job from the dropdown to see its required skills and screen candidates."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reading stored results */}
      {loadingResults && !screening && candidates.length === 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-center gap-3 py-10">
              <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--textSecondary)]">Loading screening results...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Screening in Progress */}
      {screening && (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="animate-spin text-[var(--primary)] mb-4" />
              <p className="text-lg font-medium text-[var(--text)]">Screening in Progress</p>
              <p className="text-sm text-[var(--textSecondary)] mt-1">
                Analyzing resumes against job requirements using TF-IDF, skill matching, experience, and education scoring...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last run report — what actually changed, and what didn't */}
      {run && !screening && <ScreeningRunReport run={run} onDismiss={() => setRun(null)} />}

      {/* Results Section */}
      {(screened || candidates.length > 0) && !screening && (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <Users size={24} className="mx-auto text-[var(--primary)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.total}</p>
                  {/* The tiles describe whatever the table is showing. */}
                  <p className="text-xs text-[var(--textSecondary)]">
                    {resultsView === 'run' && runEmails ? 'Just Screened' : 'Total Candidates'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <CheckCircle size={24} className="mx-auto text-[var(--success)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--success)]">{stats.shortlisted}</p>
                  <p className="text-xs text-[var(--textSecondary)]">Shortlisted</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <XCircle size={24} className="mx-auto text-[var(--error)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--error)]">{stats.rejected}</p>
                  <p className="text-xs text-[var(--textSecondary)]">Rejected</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <BarChart3 size={24} className="mx-auto text-[var(--warning)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.avgScore.toFixed(1)}%</p>
                  <p className="text-xs text-[var(--textSecondary)]">Average Score</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <TrendingUp size={24} className="mx-auto text-[var(--primary)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.topScore.toFixed(1)}%</p>
                  <p className="text-xs text-[var(--textSecondary)]">Top Score</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Tabs + Search */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex gap-1 bg-[var(--surface1)] p-1 rounded-lg">
              {([
                { key: 'all', label: 'All', count: stats.total },
                { key: 'shortlisted', label: 'Shortlisted', count: stats.shortlisted },
                { key: 'rejected', label: 'Rejected', count: stats.rejected },
              ] as { key: FilterTab; label: string; count: number }[]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    px-4 py-2 rounded-md text-sm font-medium transition-all
                    ${activeTab === tab.key
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--textSecondary)] hover:text-[var(--text)]'
                    }
                  `}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search candidates..."
                leftIcon={<Search size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Results Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>
                  {resultsView === 'run' && runEmails
                    ? `Just Screened (${filteredCandidates.length})`
                    : `Screening Results (${filteredCandidates.length})`}
                </CardTitle>

                {/* After a scoped run the table is narrowed to those
                    candidates — say so, and offer the way back. */}
                {runEmails && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--textSecondary)]">Showing</span>
                    <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setResultsView('run')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          resultsView === 'run'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--textSecondary)] hover:text-[var(--text)]'
                        }`}
                      >
                        Just screened ({runEmails.size})
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultsView('all')}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          resultsView === 'all'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--textSecondary)] hover:text-[var(--text)]'
                        }`}
                      >
                        All applicants ({candidates.length})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredCandidates.length === 0 ? (
                <EmptyState
                  icon={<Users size={48} />}
                  title="No candidates found"
                  description={
                    activeTab !== 'all'
                      ? `No ${activeTab} candidates. Try switching tabs or adjusting your search.`
                      : 'No applicants have applied for this job yet.'
                  }
                />
              ) : (
                <AtsResultsTable
                  candidates={filteredCandidates}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  onView={setSelectedCandidate}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Candidate Detail Modal */}
      {selectedCandidate && (
        <AtsCandidateDetailModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onViewResume={openResume}
          resumeLoading={resumeLoading}
        />
      )}

      {/* Resume viewer */}
      {resumeView && (
        <Modal
          isOpen={!!resumeView}
          onClose={closeResume}
          title={resumeView.name}
          size="xl"
          footer={
            <>
              <Button variant="ghost" onClick={closeResume}>
                Close
              </Button>
              <Button
                variant="outline"
                leftIcon={<ExternalLink size={16} />}
                onClick={() => window.open(resumeView.url, '_blank', 'noopener,noreferrer')}
              >
                Open in New Tab
              </Button>
              <Button leftIcon={<Download size={16} />} onClick={downloadResume}>
                Download
              </Button>
            </>
          }
        >
          <iframe
            src={resumeView.url}
            title="Resume"
            className="w-full h-[70vh] rounded-lg border border-[var(--border)] bg-white"
          />
        </Modal>
      )}
    </div>
  );
}
