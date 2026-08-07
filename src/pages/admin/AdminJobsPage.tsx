import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  Tag,
  Loader2,
  AlertTriangle,
  Eye,
  Building2,
  GraduationCap,
  DollarSign,
  Users,
  Mail,
  FileText,
  Plus,
  UserCheck,
  Pencil,
  Trash2,
} from 'lucide-react';
import { jobService, isEndpointMissing } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { extractApiError } from '@/services/api.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { ShareJobLink } from '@/components/admin/ShareJobLink';
import {
  JobListFilters,
  JobListCount,
  JobListPager,
} from '@/components/jobs/JobListControls';
import { ROUTES } from '@/config/routes';
import { MESSAGES } from '@/config/messages';
import { formatDate } from '@/utils/format.utils';
import { writePersistentValue } from '@/hooks/usePersistentState';
import { useJobListing, isJobExpired, jobDisplayName } from '@/hooks/useJobListing';
import type { JobPostDTO } from '@/types/job.types';

/**
 * Admin / Super-Admin view of every job event created on the platform.
 * Mirrors the candidate Events page, but read-only (no apply flow).
 */
export function AdminJobsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobPostDTO | null>(null);

  // Delete confirmation
  const [jobToDelete, setJobToDelete] = useState<JobPostDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Applicants on the job being deleted; null while counting or unknown. */
  const [applicantCount, setApplicantCount] = useState<number | null>(null);
  const [countingApplicants, setCountingApplicants] = useState(false);
  /** Typed confirmation, required once the job has applicants. */
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Search / type / status filters and paging — defaults to active jobs, 20 a page.
  const listing = useJobListing(jobs, 'adminJobs');

  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      try {
        const res = await jobService.getAllJobs();
        setJobs(res.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, []);

  const isDeadlinePassed = (deadline: string) => isJobExpired({ applicationDeadline: deadline });

  // Hand the job over in router state so the edit form renders instantly; the
  // form refetches by prefix if the page is opened cold.
  const handleEditJob = (job: JobPostDTO) => {
    navigate(ROUTES.ADMIN.jobsEdit(job.jobPrefix), { state: { job } });
  };

  const handleViewCandidates = (job: JobPostDTO) => {
    // Pre-select this job on the Candidates page, then navigate there.
    // CandidateDetailsPage auto-loads candidates for the persisted prefix.
    writePersistentValue('candidates:selectedPrefix', job.jobPrefix);
    navigate(ROUTES.ADMIN.CANDIDATES, {
      state: { from: { label: 'Job Events', path: ROUTES.ADMIN.JOBS } },
    });
  };

  /**
   * Opens the delete confirmation and counts the applications filed under this
   * job, so the admin sees what the delete would take with it before agreeing.
   */
  async function askDeleteJob(job: JobPostDTO) {
    setJobToDelete(job);
    setDeleteConfirmText('');
    setApplicantCount(null);
    setCountingApplicants(true);
    try {
      const res = await jobApplicationService.getByPrefix(job.jobPrefix);
      setApplicantCount((res.data ?? []).length);
    } catch {
      // Count is advisory — leave it unknown and let the dialog say so.
      setApplicantCount(null);
    } finally {
      setCountingApplicants(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setJobToDelete(null);
    setDeleteConfirmText('');
    setApplicantCount(null);
  }

  async function handleDeleteJob() {
    if (!jobToDelete || deleting) return;
    if (jobToDelete.id == null) {
      showToast(MESSAGES.admin.jobPost.deleteNoId, 'error');
      return;
    }

    setDeleting(true);
    try {
      await jobService.deleteJob(jobToDelete.id);
      showToast(MESSAGES.admin.jobPost.deleted(jobToDelete.jobPrefix), 'success');
      // Drop it locally rather than refetching the whole list.
      setJobs((prev) => prev.filter((j) => j.id !== jobToDelete.id));
      if (selectedJob?.id === jobToDelete.id) setSelectedJob(null);
      setJobToDelete(null);
      setDeleteConfirmText('');
    } catch (error) {
      // deleteJob suppresses the auto-toast so a missing route reads as what it
      // is, rather than a bare 404.
      showToast(
        isEndpointMissing(error)
          ? MESSAGES.admin.jobPost.deleteUnavailable
          : extractApiError(error).message,
        'error',
      );
    } finally {
      setDeleting(false);
    }
  }

  // Typing the prefix is only demanded when real applications are at stake.
  const deleteNeedsTypedPrefix = (applicantCount ?? 0) > 0;
  const deleteConfirmed =
    !deleteNeedsTypedPrefix ||
    deleteConfirmText.trim().toLowerCase() === (jobToDelete?.jobPrefix ?? '').toLowerCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Job Events</h1>
          <p className="text-[var(--textSecondary)] mt-1">
            All jobs created across the platform
          </p>
        </div>
        <Button
          className="w-full sm:w-auto flex-shrink-0"
          leftIcon={<Plus size={18} />}
          onClick={() => navigate(ROUTES.ADMIN.JOBS_CREATE)}
        >
          Create Job
        </Button>
      </div>

      {/* Search, type and status filters */}
      <JobListFilters
        listing={listing}
        searchPlaceholder="Search jobs by title, company, skills, location, prefix..."
      />

      {/* Results Count */}
      <JobListCount listing={listing} />

      {/* Job Cards Grid */}
      {listing.filtered.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">No jobs found</p>
          <p className="text-[var(--textSecondary)] mt-1">
            {jobs.length === 0
              ? 'No jobs have been created yet.'
              : 'Try adjusting your search, type or status filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {listing.paged.map((job) => {
            const expired = isDeadlinePassed(job.applicationDeadline);
            return (
              <Card key={job.id ?? job.jobPrefix} hover className="min-w-0">
                <CardContent>
                  <div className="space-y-4">
                    {/* Title + prefix */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="min-w-0 cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        {/* The role leads — it identifies the position more
                            precisely than the title. Older posts with no role
                            fall back to the title. */}
                        <h3
                          className="text-lg font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors truncate"
                          title={jobDisplayName(job)}
                        >
                          {jobDisplayName(job)}
                        </h3>
                        <p className="text-sm text-[var(--textSecondary)] truncate">
                          {job.companyName}
                        </p>
                        {job.role?.trim() && job.role.trim() !== job.jobTitle && (
                          <p
                            className="text-xs text-[var(--textTertiary)] truncate"
                            title={job.jobTitle}
                          >
                            {job.jobTitle}
                          </p>
                        )}
                      </div>
                      <Badge variant={expired ? 'error' : 'success'} size="sm">
                        {expired ? 'Expired' : 'Active'}
                      </Badge>
                    </div>

                    {/* Details — each line truncates so an unusually long
                        prefix or location can't stretch the card. */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <Tag size={14} className="flex-shrink-0" />
                        <span className="truncate" title={job.jobPrefix}>{job.jobPrefix}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <MapPin size={14} className="flex-shrink-0" />
                        <span className="truncate" title={job.location}>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <Briefcase size={14} className="flex-shrink-0" />
                        <span className="truncate">{job.jobType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <Users size={14} className="flex-shrink-0" />
                        <span className="truncate">
                          {job.numberOfOpenings} opening{job.numberOfOpenings !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 text-sm min-w-0 ${expired ? 'text-red-500 dark:text-red-400 font-medium' : 'text-[var(--textSecondary)]'}`}>
                        {expired ? (
                          <AlertTriangle size={14} className="flex-shrink-0" />
                        ) : (
                          <Calendar size={14} className="flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {expired
                            ? `Expired: ${formatDate(job.applicationDeadline)}`
                            : `Deadline: ${formatDate(job.applicationDeadline)}`}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons — 2×2 so four labelled actions never
                        overflow a one-third-width card on desktop or a full
                        width one on mobile. */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0"
                        onClick={() => setSelectedJob(job)}
                        leftIcon={<Eye size={15} />}
                      >
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0"
                        onClick={() => handleEditJob(job)}
                        leftIcon={<Pencil size={15} />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0"
                        onClick={() => handleViewCandidates(job)}
                        leftIcon={<UserCheck size={15} />}
                      >
                        Candidates
                      </Button>
                      <button
                        type="button"
                        onClick={() => askDeleteJob(job)}
                        aria-label={`Delete ${job.jobPrefix}`}
                        title="Delete job"
                        className="h-9 w-full min-w-0 inline-flex items-center justify-center gap-1.5
                          rounded-xl border border-[var(--border)] text-sm font-medium
                          text-[var(--textSecondary)]
                          hover:border-[var(--error)] hover:text-[var(--error)]
                          hover:bg-[var(--errorMuted,rgba(239,68,68,0.08))]
                          transition-all duration-200 active:scale-[0.97]"
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Page size + pager */}
      <JobListPager listing={listing} />

      {/* Job Details Modal */}
      {selectedJob && (
        <Modal
          isOpen={!!selectedJob}
          onClose={() => setSelectedJob(null)}
          title="Job Details"
          size="lg"
          contained
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelectedJob(null)}>
                Close
              </Button>
              <Button
                variant="danger"
                leftIcon={<Trash2 size={16} />}
                onClick={() => askDeleteJob(selectedJob)}
              >
                Delete
              </Button>
              <Button leftIcon={<Pencil size={16} />} onClick={() => handleEditJob(selectedJob)}>
                Edit Job
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-bold text-[var(--text)] break-words">
                  {jobDisplayName(selectedJob)}
                </h3>
                {selectedJob.role?.trim() && selectedJob.role.trim() !== selectedJob.jobTitle && (
                  <p className="text-sm text-[var(--textSecondary)] break-words">
                    {selectedJob.jobTitle}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <Building2 size={16} className="text-[var(--textTertiary)] flex-shrink-0" />
                  <span className="text-[var(--textSecondary)] truncate">
                    {selectedJob.companyName}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
                <Badge variant="primary" size="sm">{selectedJob.jobPrefix}</Badge>
                <Badge variant={isDeadlinePassed(selectedJob.applicationDeadline) ? 'error' : 'success'} size="sm">
                  {isDeadlinePassed(selectedJob.applicationDeadline) ? 'Expired' : 'Active'}
                </Badge>
              </div>
            </div>

            {/* Key Info Grid — single column on a phone so labels and values
                keep their own line instead of being squeezed. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[var(--textTertiary)] text-xs">Location</p>
                  <p className="text-[var(--text)] font-medium break-words">{selectedJob.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Briefcase size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[var(--textTertiary)] text-xs">Job Type</p>
                  <p className="text-[var(--text)] font-medium break-words">{selectedJob.jobType}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[var(--textTertiary)] text-xs">Experience</p>
                  <p className="text-[var(--text)] font-medium break-words">{selectedJob.experience}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[var(--textTertiary)] text-xs">Education</p>
                  <p className="text-[var(--text)] font-medium break-words">{selectedJob.education}</p>
                </div>
              </div>
              {selectedJob.salaryRange && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Salary Range</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.salaryRange}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Users size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[var(--textTertiary)] text-xs">Openings</p>
                  <p className="text-[var(--text)] font-medium break-words">{selectedJob.numberOfOpenings}</p>
                </div>
              </div>
              {selectedJob.industry && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Industry</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.industry}</p>
                  </div>
                </div>
              )}
              {selectedJob.department && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Department</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.department}</p>
                  </div>
                </div>
              )}
              {selectedJob.contactEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Contact / Created by</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.contactEmail}</p>
                  </div>
                </div>
              )}
              {selectedJob.createdAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Created</p>
                    <p className="text-[var(--text)] font-medium break-words">{formatDate(selectedJob.createdAt)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Deadline */}
            <div className={`flex items-center gap-2 p-3 rounded-lg ${isDeadlinePassed(selectedJob.applicationDeadline) ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-[var(--surface1)] border border-[var(--border)]'}`}>
              {isDeadlinePassed(selectedJob.applicationDeadline) ? (
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              ) : (
                <Calendar size={16} className="text-[var(--primary)] flex-shrink-0" />
              )}
              <span className={`text-sm font-medium ${isDeadlinePassed(selectedJob.applicationDeadline) ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                {isDeadlinePassed(selectedJob.applicationDeadline)
                  ? `Application Deadline Passed: ${formatDate(selectedJob.applicationDeadline)}`
                  : `Application Deadline: ${formatDate(selectedJob.applicationDeadline)}`}
              </span>
            </div>

            {/* Shareable apply link */}
            <div className="p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
              <ShareJobLink jobPrefix={selectedJob.jobPrefix} />
            </div>

            {/* Job Description */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-2">Job Description</h4>
              <p className="text-sm text-[var(--textSecondary)] whitespace-pre-wrap leading-relaxed">
                {selectedJob.jobDescription}
              </p>
            </div>

            {/* Key Skills */}
            {selectedJob.keySkills && (
              <div>
                <h4 className="text-sm font-semibold text-[var(--text)] mb-2">Key Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedJob.keySkills.split(',').map((skill, index) => (
                    <Badge key={index} variant="secondary" size="sm">
                      {skill.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Job Title — the role is already the heading, so the title is
                the secondary detail here. */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-2">Job Title</h4>
              <p className="text-sm text-[var(--textSecondary)] break-words">
                {selectedJob.jobTitle}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {jobToDelete && (
        <ConfirmDialog
          isOpen
          onClose={closeDeleteDialog}
          onConfirm={handleDeleteJob}
          title="Delete this job?"
          variant="danger"
          confirmText="Delete Job"
          isLoading={deleting}
          confirmDisabled={!deleteConfirmed || countingApplicants}
          message={
            <div className="space-y-3 text-left">
              <p className="text-center">
                <strong className="text-[var(--text)]">{jobDisplayName(jobToDelete)}</strong>
                <br />
                <span className="text-[var(--textTertiary)]">{jobToDelete.jobPrefix}</span>
              </p>

              <div className="rounded-xl border border-[var(--border)] px-4 py-3 space-y-1.5">
                {countingApplicants && (
                  <p className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Checking for applications…
                  </p>
                )}
                {!countingApplicants && applicantCount === null && (
                  <p className="text-[var(--warning)]">
                    Could not check how many candidates have applied — proceed with care.
                  </p>
                )}
                {!countingApplicants && applicantCount === 0 && (
                  <p>No candidates have applied to this job yet.</p>
                )}
                {!countingApplicants && (applicantCount ?? 0) > 0 && (
                  <>
                    <p className="flex items-start gap-2 text-[var(--error)] font-medium">
                      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                      {applicantCount} candidate{applicantCount === 1 ? ' has' : 's have'} already
                      applied to this job.
                    </p>
                    <p>
                      Their applications, assessments and results are filed under this prefix and
                      may be removed with it.
                    </p>
                  </>
                )}
              </div>

              <p>This cannot be undone.</p>

              {deleteNeedsTypedPrefix && (
                <Input
                  label={`Type ${jobToDelete.jobPrefix} to confirm`}
                  placeholder={jobToDelete.jobPrefix}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
