import { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  FileSearch,
  Briefcase,
  Tag,
  Users,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  BarChart3,
  Eye,
  MapPin,
  Clock,
  FileText,
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { resumeService } from '@/services/resume.service';
import axios from 'axios';
import { useToast } from '@/components/ui/Toast';
import { usePersistentState } from '@/hooks/usePersistentState';
import { AtsCandidateDetailModal } from '@/components/admin/AtsCandidateDetailModal';
import { getAppEmail } from '@/utils/application.utils';
import { getScoreColor, getScoreBg } from '@/utils/score.utils';
import { MESSAGES } from '@/config/messages';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

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
  const [activeTab, setActiveTab] = usePersistentState<FilterTab>('ats:activeTab', 'all');
  const [sortField, setSortField] = usePersistentState<SortField>('ats:sortField', 'matchPercent');
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>('ats:sortDirection', 'desc');
  const [searchQuery, setSearchQuery] = usePersistentState('ats:searchQuery', '');

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
    setSelectedPrefix(prefix);
    const job = jobs.find((j) => j.jobPrefix === prefix) ?? null;
    setSelectedJob(job);
    setCandidates([]);
    setScreened(false);
    setActiveTab('all');
    setSearchQuery('');
  }

  async function handleScreenCandidates() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }

    setScreening(true);
    setCandidates([]);
    setScreened(false);
    try {
      const res = await jobApplicationService.filterByPrefix(selectedPrefix);
      const data = res.data ?? [];
      setCandidates(data);
      setScreened(true);

      const shortlisted = data.filter((c) => c.status === 'SHORTLISTED').length;
      const rejected = data.filter((c) => c.status === 'REJECTED').length;

      if (data.length === 0) {
        showToast(MESSAGES.admin.ats.noApplicants, 'info');
      } else {
        showToast(
          MESSAGES.admin.ats.screeningComplete(shortlisted, rejected, data.length),
          'success'
        );
      }
    } catch {
      // Error toast auto-handled
    } finally {
      setScreening(false);
    }
  }

  // Stats
  const stats = useMemo(() => {
    const total = candidates.length;
    const shortlisted = candidates.filter((c) => c.status === 'SHORTLISTED').length;
    const rejected = candidates.filter((c) => c.status === 'REJECTED').length;
    const avgScore = total > 0
      ? candidates.reduce((sum, c) => sum + (c.matchPercent ?? 0), 0) / total
      : 0;
    const topScore = total > 0
      ? Math.max(...candidates.map((c) => c.matchPercent ?? 0))
      : 0;
    return { total, shortlisted, rejected, avgScore, topScore };
  }, [candidates]);

  // Filter + Search + Sort
  const filteredCandidates = useMemo(() => {
    let list = [...candidates];

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
  }, [candidates, activeTab, searchQuery, sortField, sortDirection]);

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
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">ATS Screening</h1>
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
                <Button
                  onClick={handleScreenCandidates}
                  isLoading={screening}
                  leftIcon={!screening ? <BarChart3 size={18} /> : undefined}
                  className="w-full"
                  size="lg"
                >
                  {screening ? 'Screening Candidates...' : 'Screen All Candidates'}
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

      {/* Results Section */}
      {screened && !screening && (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent>
                <div className="text-center py-2">
                  <Users size={24} className="mx-auto text-[var(--primary)] mb-1" />
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.total}</p>
                  <p className="text-xs text-[var(--textSecondary)]">Total Candidates</p>
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
              <div className="flex items-center justify-between">
                <CardTitle>
                  Screening Results ({filteredCandidates.length})
                </CardTitle>
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>
                          <button
                            className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                            onClick={() => toggleSort('firstName')}
                          >
                            Name
                            <ArrowUpDown size={14} className={sortField === 'firstName' ? 'text-[var(--primary)]' : ''} />
                          </button>
                        </TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>
                          <button
                            className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                            onClick={() => toggleSort('experience')}
                          >
                            Experience
                            <ArrowUpDown size={14} className={sortField === 'experience' ? 'text-[var(--primary)]' : ''} />
                          </button>
                        </TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Resume</TableHead>
                        <TableHead>
                          <button
                            className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                            onClick={() => toggleSort('matchPercent')}
                          >
                            ATS Score
                            <ArrowUpDown size={14} className={sortField === 'matchPercent' ? 'text-[var(--primary)]' : ''} />
                          </button>
                        </TableHead>
                        <TableHead>Scan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.map((candidate, idx) => {
                        const score = candidate.matchPercent ?? 0;
                        // Prefer the genuine shortlistStatus column; fall back to status.
                        const isShortlisted = candidate.shortlistStatus
                          ? !/not/i.test(candidate.shortlistStatus)
                          : candidate.status === 'SHORTLISTED';
                        const shortlistLabel =
                          candidate.shortlistStatus ?? (isShortlisted ? 'Shortlisted' : 'Rejected');
                        const scanDone = candidate.atsScanStatus
                          ? /complet/i.test(candidate.atsScanStatus)
                          : undefined;

                        return (
                          <TableRow key={candidate.id ?? getAppEmail(candidate)}>
                            <TableCell>
                              <span className="text-sm font-bold text-[var(--text)]">#{idx + 1}</span>
                            </TableCell>
                            <TableCell className="font-medium">
                              {candidate.firstName} {candidate.lastName}
                            </TableCell>
                            <TableCell className="text-sm">
                              {getAppEmail(candidate)}
                            </TableCell>
                            <TableCell>{candidate.experience}</TableCell>
                            <TableCell>{candidate.jobRole || '-'}</TableCell>
                            <TableCell>
                              {candidate.resumeFileName ? (
                                <span className="flex items-center gap-1 text-sm text-[var(--textSecondary)]">
                                  <FileText size={14} />
                                  <span className="truncate max-w-[120px]">{candidate.resumeFileName}</span>
                                </span>
                              ) : (
                                <span className="text-sm text-[var(--textTertiary)]">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {/* Score bar */}
                                <div className="w-16 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getScoreBg(score)}`}
                                    style={{ width: `${Math.min(score, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                                  {score.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {candidate.atsScanStatus ? (
                                <Badge variant={scanDone ? 'info' : 'warning'} size="sm">
                                  {candidate.atsScanStatus}
                                </Badge>
                              ) : (
                                <span className="text-sm text-[var(--textTertiary)]">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={isShortlisted ? 'success' : 'error'}
                                size="sm"
                              >
                                <span className="flex items-center gap-1">
                                  {isShortlisted ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                  {shortlistLabel}
                                </span>
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedCandidate(candidate)}
                                leftIcon={<Eye size={14} />}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
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
