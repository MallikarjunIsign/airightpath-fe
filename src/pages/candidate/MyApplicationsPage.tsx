import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Briefcase,
  Building2,
  Calendar,
  Loader2,
  FileText,
  ExternalLink,
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  Tag,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { jobApplicationService } from '@/services/job-application.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { JobApplicationDTO, JobApplicationStatus } from '@/types/job.types';

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary' }
> = {
  APPLIED: { label: 'Applied', variant: 'info' },
  SHORTLISTED: { label: 'Shortlisted', variant: 'success' },
  ACKNOWLEDGED: { label: 'Acknowledged', variant: 'primary' },
  ACKNOWLEDGED_BACK: { label: 'Acknowledged Back', variant: 'primary' },
  RECONFIRMED: { label: 'Reconfirmed', variant: 'primary' },
  EXAM_SENT: { label: 'Exam Sent', variant: 'warning' },
  EXAM_COMPLETED: { label: 'Exam Completed', variant: 'info' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', variant: 'primary' },
  INTERVIEW_COMPLETED: { label: 'Interview Completed', variant: 'info' },
  SELECTED: { label: 'Selected', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'error' },
};

function getStatusBadge(status: string | undefined) {
  const config = STATUS_CONFIG[status ?? ''] ?? { label: status ?? 'Unknown', variant: 'default' as const };
  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
}

export function MyApplicationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [applications, setApplications] = useState<JobApplicationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedApp, setSelectedApp] = useState<JobApplicationDTO | null>(null);

  useEffect(() => {
    async function fetchApplications() {
      if (!user?.email) return;
      setLoading(true);
      try {
        const res = await jobApplicationService.getByEmail(user.email);
        setApplications(res.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchApplications();
  }, [user?.email]);

  const statuses = useMemo(() => {
    const set = new Set(applications.map((a) => a.status).filter(Boolean));
    return Array.from(set);
  }, [applications]);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        (app.jobTitle ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.companyName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.jobPrefix.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = !filterStatus || app.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [applications, searchQuery, filterStatus]);

  const handleEdit = (app: JobApplicationDTO) => {
    navigate(ROUTES.CANDIDATE.APPLY, {
      state: {
        job: {
          jobPrefix: app.jobPrefix,
          jobTitle: app.jobTitle ?? app.jobPrefix,
          companyName: app.companyName ?? '',
          applicationDeadline: app.applicationDeadline ?? '',
          role: app.jobRole ?? '',
        },
        existingApplication: app,
      },
    });
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
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">My Applications</h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          Track the status of all your job applications
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by job title, company, or prefix..."
            leftIcon={<Search size={18} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <select
            className="w-full px-4 py-2 rounded-lg appearance-none bg-[var(--inputBg)] border border-[var(--inputBorder)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--inputFocus)] focus:border-transparent transition-all duration-200"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status]?.label ?? status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-[var(--textSecondary)]">
        Showing {filteredApplications.length} of {applications.length} applications
      </p>

      {/* Applications List */}
      {filteredApplications.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">
            {applications.length === 0 ? 'No applications yet' : 'No matching applications'}
          </p>
          <p className="text-[var(--textSecondary)] mt-1">
            {applications.length === 0
              ? 'Browse available jobs and start applying.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {applications.length === 0 && (
            <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.EVENTS)}>
              Browse Jobs
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredApplications.map((app) => (
            <Card key={app.id ?? `${app.jobPrefix}-${app.email}`} hover>
              <CardContent>
                <div className="space-y-4">
                  {/* Job Title and Company */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-[var(--text)] truncate">
                        {app.jobTitle ?? app.jobPrefix}
                      </h3>
                      {app.companyName && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Building2 size={13} className="text-[var(--textTertiary)] flex-shrink-0" />
                          <span className="text-sm text-[var(--textSecondary)] truncate">
                            {app.companyName}
                          </span>
                        </div>
                      )}
                    </div>
                    {getStatusBadge(app.status)}
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Briefcase size={14} className="flex-shrink-0" />
                      <span>Ref: {app.jobPrefix}</span>
                    </div>
                    {app.jobRole && (
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Tag size={14} className="flex-shrink-0" />
                        <span>Role: {app.jobRole}</span>
                      </div>
                    )}
                    {app.applicationDeadline && (
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <Calendar size={14} className="flex-shrink-0" />
                        <span>Deadline: {formatDate(app.applicationDeadline)}</span>
                      </div>
                    )}
                    {app.resumeFileName && (
                      <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                        <FileText size={14} className="flex-shrink-0" />
                        <span className="truncate">Resume: {app.resumeFileName}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedApp(app)}
                      leftIcon={<ExternalLink size={16} />}
                    >
                      View
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => handleEdit(app)}
                      leftIcon={<FileText size={16} />}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Application Details Modal */}
      {selectedApp && (
        <Modal
          isOpen={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          title="Application Details"
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelectedApp(null)}>
                Close
              </Button>
              <Button onClick={() => { setSelectedApp(null); handleEdit(selectedApp); }}>
                Edit Application
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[var(--text)]">
                  {selectedApp.jobTitle ?? selectedApp.jobPrefix}
                </h3>
                {selectedApp.companyName && (
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 size={16} className="text-[var(--textTertiary)]" />
                    <span className="text-[var(--textSecondary)]">{selectedApp.companyName}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="primary" size="sm">{selectedApp.jobPrefix}</Badge>
                {getStatusBadge(selectedApp.status)}
              </div>
            </div>

            {/* Personal Information */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <User size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Full Name</p>
                    <p className="text-[var(--text)] font-medium">
                      {selectedApp.firstName} {selectedApp.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Email</p>
                    <p className="text-[var(--text)] font-medium">
                      {selectedApp.email || selectedApp.userEmail}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Mobile</p>
                    <p className="text-[var(--text)] font-medium">
                      {selectedApp.mobileNumber || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Experience</p>
                    <p className="text-[var(--text)] font-medium">{selectedApp.experience}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Address</p>
                    <p className="text-[var(--text)] font-medium">{selectedApp.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Applied Role</p>
                    <p className="text-[var(--text)] font-medium">{selectedApp.jobRole}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Application Status */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Application Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <span className="text-sm text-[var(--textSecondary)]">Status</span>
                  {getStatusBadge(selectedApp.status)}
                </div>
                {selectedApp.confirmationStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Confirmation</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedApp.confirmationStatus}</span>
                  </div>
                )}
                {selectedApp.acknowledgedStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Acknowledged</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedApp.acknowledgedStatus}</span>
                  </div>
                )}
                {selectedApp.reconfirmationStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Reconfirmation</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedApp.reconfirmationStatus}</span>
                  </div>
                )}
                {selectedApp.writtenTestStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Written Test</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedApp.writtenTestStatus}</span>
                  </div>
                )}
                {selectedApp.interview && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Interview</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedApp.interview}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Resume */}
            {selectedApp.resumeFileName && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <FileText size={20} className="text-[var(--primary)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">Resume</p>
                  <p className="text-xs text-[var(--textSecondary)] truncate">{selectedApp.resumeFileName}</p>
                </div>
              </div>
            )}

            {/* Deadline */}
            {selectedApp.applicationDeadline && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <Calendar size={16} className="text-[var(--primary)] flex-shrink-0" />
                <span className="text-sm text-[var(--text)]">
                  Application Deadline: {formatDate(selectedApp.applicationDeadline)}
                </span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
