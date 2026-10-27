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
  CheckCircle,
  Eye,
  Building2,
  GraduationCap,
  DollarSign,
  Users,
  Mail,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  JobListFilters,
  JobListCount,
  JobListPager,
} from '@/components/jobs/JobListControls';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import { useJobListing, isJobExpired } from '@/hooks/useJobListing';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

export function EventsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [appliedJobPrefixes, setAppliedJobPrefixes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobPostDTO | null>(null);

  // Search / type / status filters and paging — defaults to active jobs, 20 a page.
  const listing = useJobListing(jobs, 'events');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [jobsRes, appsRes] = await Promise.all([
          jobService.getAllJobs(),
          user?.email ? jobApplicationService.getByEmail(user.email) : Promise.resolve({ data: [] }),
        ]);
        setJobs(jobsRes.data ?? []);
        const appliedPrefixes = new Set(
          (appsRes.data ?? []).map((app: JobApplicationDTO) => app.jobPrefix)
        );
        setAppliedJobPrefixes(appliedPrefixes);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.email]);

  const isDeadlinePassed = (deadline: string) => isJobExpired({ applicationDeadline: deadline });

  const isJobApplied = (job: JobPostDTO) => {
    return appliedJobPrefixes.has(job.jobPrefix);
  };

  const handleApply = (job: JobPostDTO) => {
    navigate(ROUTES.CANDIDATE.APPLY, { state: { job } });
  };

  const handleViewDetails = (job: JobPostDTO) => {
    setSelectedJob(job);
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
      <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Available Jobs</h1>

      {/* Search, type and status filters */}
      <JobListFilters
        listing={listing}
        searchPlaceholder="Search jobs by title, company, skills, location..."
      />

      {/* Results Count */}
      <JobListCount listing={listing} />

      {/* Job Cards Grid */}
      {listing.filtered.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">No jobs found</p>
          <p className="text-[var(--textSecondary)] mt-1">
            Try adjusting your search, type or status filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {listing.paged.map((job) => {
            const applied = isJobApplied(job);
            const expired = isDeadlinePassed(job.applicationDeadline);

            return (
              <Card key={job.id ?? job.jobPrefix} hover className="min-w-0">
                <CardContent>
                  <div className="space-y-4">
                    {/* Job Title, Company and Applied Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="min-w-0 cursor-pointer"
                        onClick={() => handleViewDetails(job)}
                      >
                        <h3 className="text-lg font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors truncate">
                          {job.jobTitle}
                        </h3>
                        <p className="text-sm text-[var(--textSecondary)] truncate">
                          {job.companyName}
                        </p>
                      </div>
                      {applied && (
                        <Badge variant="success" size="sm" className="flex-shrink-0">
                          <span className="flex items-center gap-1">
                            <CheckCircle size={12} />
                            Applied
                          </span>
                        </Badge>
                      )}
                    </div>

                    {/* Details — each line truncates so long values can't
                        stretch the card on any screen. */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <MapPin size={14} className="flex-shrink-0" />
                        <span className="truncate" title={job.location}>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <Briefcase size={14} className="flex-shrink-0" />
                        <span className="truncate">{job.jobType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)] min-w-0">
                        <Clock size={14} className="flex-shrink-0" />
                        <span className="truncate">{job.experience} experience</span>
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

                    {/* Skills */}
                    {job.keySkills && (
                      <div className="flex items-start gap-2">
                        <Tag size={14} className="flex-shrink-0 mt-1 text-[var(--textTertiary)]" />
                        <div className="flex flex-wrap gap-1">
                          {job.keySkills
                            .split(',')
                            .slice(0, 4)
                            .map((skill, index) => (
                              <Badge key={index} variant="secondary" size="sm">
                                {skill.trim()}
                              </Badge>
                            ))}
                          {job.keySkills.split(',').length > 4 && (
                            <Badge variant="default" size="sm">
                              +{job.keySkills.split(',').length - 4}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons — a grid so the two labels share the row
                        evenly and never overflow a narrow card. */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0"
                        onClick={() => handleViewDetails(job)}
                        leftIcon={<Eye size={15} />}
                      >
                        Details
                      </Button>
                      {applied ? (
                        <Button
                          size="sm"
                          className="w-full min-w-0"
                          variant="outline"
                          onClick={() => handleApply(job)}
                          leftIcon={<CheckCircle size={15} />}
                        >
                          View Application
                        </Button>
                      ) : expired ? (
                        <Button size="sm" className="w-full min-w-0" disabled>
                          Deadline Passed
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full min-w-0"
                          onClick={() => handleApply(job)}
                        >
                          Apply Now
                        </Button>
                      )}
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
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelectedJob(null)}>
                Close
              </Button>
              {isJobApplied(selectedJob) ? (
                <Button
                  onClick={() => {
                    setSelectedJob(null);
                    handleApply(selectedJob);
                  }}
                  leftIcon={<CheckCircle size={16} />}
                >
                  View Application
                </Button>
              ) : !isDeadlinePassed(selectedJob.applicationDeadline) ? (
                <Button
                  onClick={() => {
                    setSelectedJob(null);
                    handleApply(selectedJob);
                  }}
                >
                  Apply Now
                </Button>
              ) : null}
            </>
          }
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-bold text-[var(--text)] break-words">
                  {selectedJob.jobTitle}
                </h3>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <Building2 size={16} className="text-[var(--textTertiary)] flex-shrink-0" />
                  <span className="text-[var(--textSecondary)] truncate">
                    {selectedJob.companyName}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
                <Badge variant="primary" size="sm">{selectedJob.jobPrefix}</Badge>
                {isJobApplied(selectedJob) && (
                  <Badge variant="success" size="sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle size={12} />
                      Applied
                    </span>
                  </Badge>
                )}
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
              {selectedJob.numberOfOpenings && (
                <div className="flex items-center gap-2 text-sm">
                  <Users size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Openings</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.numberOfOpenings}</p>
                  </div>
                </div>
              )}
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
                    <p className="text-[var(--textTertiary)] text-xs">Contact</p>
                    <p className="text-[var(--text)] font-medium break-words">{selectedJob.contactEmail}</p>
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
