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
} from 'lucide-react';
import { jobService } from '@/services/job.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ShareJobLink } from '@/components/admin/ShareJobLink';
import {
  JobListFilters,
  JobListCount,
  JobListPager,
} from '@/components/jobs/JobListControls';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import { writePersistentValue } from '@/hooks/usePersistentState';
import { useJobListing, isJobExpired } from '@/hooks/useJobListing';
import type { JobPostDTO } from '@/types/job.types';

/**
 * Admin / Super-Admin view of every job event created on the platform.
 * Mirrors the candidate Events page, but read-only (no apply flow).
 */
export function AdminJobsPage() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobPostDTO | null>(null);

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

  const handleViewCandidates = (job: JobPostDTO) => {
    // Pre-select this job on the Candidates page, then navigate there.
    // CandidateDetailsPage auto-loads candidates for the persisted prefix.
    writePersistentValue('candidates:selectedPrefix', job.jobPrefix);
    navigate(ROUTES.ADMIN.CANDIDATES);
  };

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
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Job Events</h1>
          <p className="text-[var(--textSecondary)] mt-1">
            All jobs created across the platform
          </p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={() => navigate(ROUTES.ADMIN.JOBS_CREATE)}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listing.paged.map((job) => {
            const expired = isDeadlinePassed(job.applicationDeadline);
            return (
              <Card key={job.id ?? job.jobPrefix} hover>
                <CardContent>
                  <div className="space-y-4">
                    {/* Title + prefix */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="min-w-0 cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        <h3 className="text-lg font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors truncate">
                          {job.jobTitle}
                        </h3>
                        <p className="text-sm text-[var(--textSecondary)]">{job.companyName}</p>
                      </div>
                      <Badge variant={expired ? 'error' : 'success'} size="sm">
                        {expired ? 'Expired' : 'Active'}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Tag size={14} className="flex-shrink-0" />
                        <span>{job.jobPrefix}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <MapPin size={14} className="flex-shrink-0" />
                        <span>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Briefcase size={14} className="flex-shrink-0" />
                        <span>{job.jobType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Users size={14} className="flex-shrink-0" />
                        <span>
                          {job.numberOfOpenings} opening{job.numberOfOpenings !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 text-sm ${expired ? 'text-red-500 dark:text-red-400 font-medium' : 'text-[var(--textSecondary)]'}`}>
                        {expired ? (
                          <AlertTriangle size={14} className="flex-shrink-0" />
                        ) : (
                          <Calendar size={14} className="flex-shrink-0" />
                        )}
                        <span>
                          {expired
                            ? `Expired: ${formatDate(job.applicationDeadline)}`
                            : `Deadline: ${formatDate(job.applicationDeadline)}`}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setSelectedJob(job)}
                        leftIcon={<Eye size={16} />}
                      >
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleViewCandidates(job)}
                        leftIcon={<UserCheck size={16} />}
                      >
                        Candidates
                      </Button>
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
            <Button variant="ghost" onClick={() => setSelectedJob(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-[var(--text)]">{selectedJob.jobTitle}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 size={16} className="text-[var(--textTertiary)]" />
                  <span className="text-[var(--textSecondary)]">{selectedJob.companyName}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="primary" size="sm">{selectedJob.jobPrefix}</Badge>
                <Badge variant={isDeadlinePassed(selectedJob.applicationDeadline) ? 'error' : 'success'} size="sm">
                  {isDeadlinePassed(selectedJob.applicationDeadline) ? 'Expired' : 'Active'}
                </Badge>
              </div>
            </div>

            {/* Key Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div>
                  <p className="text-[var(--textTertiary)] text-xs">Location</p>
                  <p className="text-[var(--text)] font-medium">{selectedJob.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Briefcase size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div>
                  <p className="text-[var(--textTertiary)] text-xs">Job Type</p>
                  <p className="text-[var(--text)] font-medium">{selectedJob.jobType}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div>
                  <p className="text-[var(--textTertiary)] text-xs">Experience</p>
                  <p className="text-[var(--text)] font-medium">{selectedJob.experience}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div>
                  <p className="text-[var(--textTertiary)] text-xs">Education</p>
                  <p className="text-[var(--text)] font-medium">{selectedJob.education}</p>
                </div>
              </div>
              {selectedJob.salaryRange && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Salary Range</p>
                    <p className="text-[var(--text)] font-medium">{selectedJob.salaryRange}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Users size={16} className="text-[var(--primary)] flex-shrink-0" />
                <div>
                  <p className="text-[var(--textTertiary)] text-xs">Openings</p>
                  <p className="text-[var(--text)] font-medium">{selectedJob.numberOfOpenings}</p>
                </div>
              </div>
              {selectedJob.industry && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Industry</p>
                    <p className="text-[var(--text)] font-medium">{selectedJob.industry}</p>
                  </div>
                </div>
              )}
              {selectedJob.department && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Department</p>
                    <p className="text-[var(--text)] font-medium">{selectedJob.department}</p>
                  </div>
                </div>
              )}
              {selectedJob.contactEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Contact / Created by</p>
                    <p className="text-[var(--text)] font-medium">{selectedJob.contactEmail}</p>
                  </div>
                </div>
              )}
              {selectedJob.createdAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Created</p>
                    <p className="text-[var(--text)] font-medium">{formatDate(selectedJob.createdAt)}</p>
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

            {/* Role */}
            {selectedJob.role && (
              <div>
                <h4 className="text-sm font-semibold text-[var(--text)] mb-2">Role</h4>
                <p className="text-sm text-[var(--textSecondary)]">{selectedJob.role}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
