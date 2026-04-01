import { useState, useEffect } from 'react';
import {
  Loader2,
  Users,
  Mail,
  XCircle,
  RefreshCw,
  LinkIcon,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Eye,
  FileText,
  Phone,
  MapPin,
  Briefcase,
  Clock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { useToast } from '@/components/ui/Toast';
import type { JobPostDTO, JobApplicationDTO, JobApplicationStatus } from '@/types/job.types';

const STAGES: JobApplicationStatus[] = [
  'APPLIED',
  'SHORTLISTED',
  'ACKNOWLEDGED',
  'ACKNOWLEDGED_BACK',
  'RECONFIRMED',
  'EXAM_SENT',
  'EXAM_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
];

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  ACKNOWLEDGED: 'Acknowledged',
  ACKNOWLEDGED_BACK: 'Ack Back',
  RECONFIRMED: 'Reconfirmed',
  EXAM_SENT: 'Exam Sent',
  EXAM_COMPLETED: 'Exam Completed',
  INTERVIEW_SCHEDULED: 'Interview',
  INTERVIEW_COMPLETED: 'Interview Done',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

type BulkAction =
  | 'ack'
  | 'rejection'
  | 'reconfirmation'
  | 'examLink'
  | 'success'
  | 'failure';

const BULK_ACTION_CONFIG: Record<
  BulkAction,
  { label: string; hasDateTime: boolean; icon: React.ReactNode }
> = {
  ack: { label: 'Send Ack Mail', hasDateTime: true, icon: <Mail size={16} /> },
  rejection: { label: 'Send Rejection', hasDateTime: false, icon: <XCircle size={16} /> },
  reconfirmation: { label: 'Send Reconfirmation', hasDateTime: false, icon: <RefreshCw size={16} /> },
  examLink: { label: 'Send Exam Link', hasDateTime: true, icon: <LinkIcon size={16} /> },
  success: { label: 'Send Success', hasDateTime: false, icon: <CheckCircle size={16} /> },
  failure: { label: 'Send Failure', hasDateTime: false, icon: <AlertTriangle size={16} /> },
};

// Stage-specific actions: only show relevant bulk action buttons per stage
const STAGE_ACTIONS: Record<string, BulkAction[]> = {
  APPLIED: [],
  SHORTLISTED: ['ack', 'rejection'],
  ACKNOWLEDGED: [],
  ACKNOWLEDGED_BACK: ['reconfirmation', 'rejection'],
  RECONFIRMED: ['examLink', 'rejection'],
  EXAM_SENT: [],
  EXAM_COMPLETED: ['rejection'],
  INTERVIEW_SCHEDULED: [],
  INTERVIEW_COMPLETED: ['success', 'rejection'],
  SELECTED: [],
};

// Helper to get email from application (handles both email and userEmail fields)
function getAppEmail(app: JobApplicationDTO): string {
  return app.email || app.userEmail || '';
}

export function CandidateDetailsPage() {
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [activeStage, setActiveStage] = useState<JobApplicationStatus>('APPLIED');
  const [candidates, setCandidates] = useState<JobApplicationDTO[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Modal state
  const [modalAction, setModalAction] = useState<BulkAction | null>(null);
  const [modalDateTime, setModalDateTime] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [sending, setSending] = useState(false);

  // Candidate detail modal
  const [selectedCandidate, setSelectedCandidate] = useState<JobApplicationDTO | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedPrefix) {
      fetchCandidates();
    } else {
      setCandidates([]);
    }
    setSelectedEmails(new Set());
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

  async function fetchCandidates() {
    if (!selectedPrefix) return;
    setLoadingCandidates(true);
    try {
      const res = await jobApplicationService.getByPrefix(selectedPrefix);
      const data = res.data ?? [];
      setCandidates(data);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingCandidates(false);
    }
  }

  const filteredCandidates = candidates.filter((c) => {
    const status = c.status ?? '';
    if (activeStage === ('REJECTED' as JobApplicationStatus)) {
      return status === 'REJECTED';
    }
    return status === activeStage;
  });

  const stageCounts = STAGES.reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = candidates.filter((c) => (c.status ?? '') === stage).length;
    return acc;
  }, {});

  // Count rejected candidates separately
  const rejectedCount = candidates.filter((c) => c.status === 'REJECTED').length;

  // Count candidates with null/unrecognized status
  const unknownCount = candidates.filter(
    (c) => !c.status || (!STAGES.includes(c.status as JobApplicationStatus) && c.status !== 'REJECTED')
  ).length;

  // Available actions for the current stage
  const availableActions = STAGE_ACTIONS[activeStage] ?? [];

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEmails.size === filteredCandidates.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredCandidates.map((c) => getAppEmail(c))));
    }
  };

  function openActionModal(action: BulkAction) {
    if (selectedEmails.size === 0) {
      showToast('Please select at least one candidate', 'warning');
      return;
    }
    setModalAction(action);
    setModalDateTime('');
    setModalContent('');
  }

  async function handleSendAction() {
    if (!modalAction || !selectedPrefix) return;

    // Require dateTime for ack mail (email contains exam schedule)
    if (modalAction === 'ack' && !modalDateTime) {
      showToast('Date & Time is required for acknowledgement mail', 'warning');
      return;
    }

    setSending(true);

    const emails = Array.from(selectedEmails);
    const payload: {
      emails: string[];
      jobPrefix: string;
      dateTime?: string;
      content?: string;
    } = {
      emails,
      jobPrefix: selectedPrefix,
    };

    if (BULK_ACTION_CONFIG[modalAction].hasDateTime && modalDateTime) {
      payload.dateTime = modalDateTime;
    }
    if (modalContent.trim()) {
      payload.content = modalContent.trim();
    }

    try {
      switch (modalAction) {
        case 'ack':
          await jobApplicationService.sendAckMail(payload);
          break;
        case 'rejection':
          await jobApplicationService.sendRejectionMail(payload);
          break;
        case 'reconfirmation':
          await jobApplicationService.sendReconfirmationMail(payload);
          break;
        case 'examLink':
          await jobApplicationService.sendExamLink(payload);
          break;
        case 'success':
          await jobApplicationService.sendSuccessMail(payload);
          break;
        case 'failure':
          await jobApplicationService.sendFailureMail(payload);
          break;
      }
      showToast(`${BULK_ACTION_CONFIG[modalAction].label} sent successfully!`, 'success');
      setModalAction(null);
      setSelectedEmails(new Set());
      fetchCandidates();
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSending(false);
    }
  }

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
        <h1 className="text-3xl font-bold text-[var(--text)]">Candidate Details</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Track and manage candidates through the recruitment pipeline
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
          {selectedPrefix && !loadingCandidates && (
            <p className="mt-2 text-sm text-[var(--textSecondary)]">
              Total candidates: <strong>{candidates.length}</strong>
              {unknownCount > 0 && (
                <span className="ml-2 text-amber-500">
                  ({unknownCount} with unrecognized status)
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {selectedPrefix && (
        <>
          {/* Stepper */}
          <Card padding="sm">
            <CardContent>
              <div className="flex items-center overflow-x-auto scrollbar-thin pb-2">
                {STAGES.map((stage, idx) => {
                  const isActive = stage === activeStage;
                  const count = stageCounts[stage] || 0;
                  return (
                    <div key={stage} className="flex items-center flex-shrink-0">
                      <button
                        onClick={() => {
                          setActiveStage(stage);
                          setSelectedEmails(new Set());
                        }}
                        className={`
                          flex flex-col items-center px-3 py-2 rounded-lg transition-all duration-200
                          ${isActive
                            ? 'bg-[var(--primary)] text-white'
                            : 'hover:bg-[var(--surface1)] text-[var(--textSecondary)]'
                          }
                        `}
                      >
                        <span className="text-xs font-semibold whitespace-nowrap">
                          {STAGE_LABELS[stage]}
                        </span>
                        <span className={`text-lg font-bold ${isActive ? 'text-white' : 'text-[var(--text)]'}`}>
                          {count}
                        </span>
                      </button>
                      {idx < STAGES.length - 1 && (
                        <ChevronRight
                          size={16}
                          className="text-[var(--textTertiary)] mx-1 flex-shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
                {/* Rejected tab - separated from pipeline */}
                {rejectedCount > 0 && (
                  <div className="flex items-center flex-shrink-0 ml-4 pl-4 border-l border-[var(--border)]">
                    <button
                      onClick={() => {
                        setActiveStage('REJECTED' as JobApplicationStatus);
                        setSelectedEmails(new Set());
                      }}
                      className={`
                        flex flex-col items-center px-3 py-2 rounded-lg transition-all duration-200
                        ${activeStage === ('REJECTED' as JobApplicationStatus)
                          ? 'bg-red-500 text-white'
                          : 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500'
                        }
                      `}
                    >
                      <span className="text-xs font-semibold whitespace-nowrap">Rejected</span>
                      <span className={`text-lg font-bold ${activeStage === ('REJECTED' as JobApplicationStatus) ? 'text-white' : 'text-red-500'}`}>
                        {rejectedCount}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions — only show actions relevant to the active stage */}
          {availableActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availableActions.map((key) => {
                const config = BULK_ACTION_CONFIG[key];
                return (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    leftIcon={config.icon}
                    onClick={() => openActionModal(key)}
                  >
                    {config.label}
                  </Button>
                );
              })}
            </div>
          )}

          {/* Candidate Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {STAGE_LABELS[activeStage]} ({filteredCandidates.length})
                </CardTitle>
                {filteredCandidates.length > 0 && (
                  <span className="text-sm text-[var(--textSecondary)]">
                    {selectedEmails.size} selected
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <EmptyState
                  icon={<Users size={48} />}
                  title="No candidates"
                  description={`No candidates found in the "${STAGE_LABELS[activeStage]}" stage for this job.`}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <input
                            type="checkbox"
                            checked={
                              selectedEmails.size === filteredCandidates.length &&
                              filteredCandidates.length > 0
                            }
                            onChange={toggleAll}
                            className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead>Experience</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.map((candidate) => {
                        const email = getAppEmail(candidate);
                        return (
                          <TableRow key={candidate.id ?? email}>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedEmails.has(email)}
                                onChange={() => toggleEmail(email)}
                                className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {candidate.firstName} {candidate.lastName}
                            </TableCell>
                            <TableCell>{email}</TableCell>
                            <TableCell>{candidate.mobileNumber || '-'}</TableCell>
                            <TableCell>{candidate.experience}</TableCell>
                            <TableCell>{candidate.jobRole || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="info" size="sm">
                                {STAGE_LABELS[candidate.status] ?? candidate.status}
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

      {/* Bulk Action Modal */}
      {modalAction && (
        <Modal
          isOpen={!!modalAction}
          onClose={() => setModalAction(null)}
          title={BULK_ACTION_CONFIG[modalAction].label}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalAction(null)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSendAction} isLoading={sending}>
                Send
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--textSecondary)]">
              Sending to <strong>{selectedEmails.size}</strong> candidate
              {selectedEmails.size !== 1 ? 's' : ''}.
            </p>

            {BULK_ACTION_CONFIG[modalAction].hasDateTime && (
              <Input
                label={modalAction === 'ack' ? 'Date & Time *' : 'Date & Time'}
                type="datetime-local"
                value={modalDateTime}
                onChange={(e) => setModalDateTime(e.target.value)}
                required={modalAction === 'ack'}
              />
            )}

            <Textarea
              label="Message Content (optional)"
              placeholder="Enter custom message content..."
              value={modalContent}
              onChange={(e) => setModalContent(e.target.value)}
              maxLength={2000}
              showCharCount
            />
          </div>
        </Modal>
      )}

      {/* Candidate Detail Modal */}
      {selectedCandidate && (
        <Modal
          isOpen={!!selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          title="Candidate Details"
          size="lg"
          footer={
            <Button variant="ghost" onClick={() => setSelectedCandidate(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[var(--text)]">
                  {selectedCandidate.firstName} {selectedCandidate.lastName}
                </h3>
                <p className="text-sm text-[var(--textSecondary)] mt-0.5">
                  {getAppEmail(selectedCandidate)}
                </p>
              </div>
              <Badge
                variant={
                  selectedCandidate.status === 'APPLIED' ? 'info' :
                  selectedCandidate.status === 'SHORTLISTED' ? 'success' :
                  selectedCandidate.status === 'REJECTED' ? 'error' : 'primary'
                }
                size="sm"
              >
                {STAGE_LABELS[selectedCandidate.status] ?? selectedCandidate.status}
              </Badge>
            </div>

            {/* Personal Info */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Email</p>
                    <p className="text-[var(--text)] font-medium">{getAppEmail(selectedCandidate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Mobile</p>
                    <p className="text-[var(--text)] font-medium">{selectedCandidate.mobileNumber || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Experience</p>
                    <p className="text-[var(--text)] font-medium">{selectedCandidate.experience}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Applied Role</p>
                    <p className="text-[var(--text)] font-medium">{selectedCandidate.jobRole || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm col-span-full">
                  <MapPin size={16} className="text-[var(--primary)] flex-shrink-0" />
                  <div>
                    <p className="text-[var(--textTertiary)] text-xs">Address</p>
                    <p className="text-[var(--text)] font-medium">{selectedCandidate.address}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Application Status Details */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Application Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <span className="text-sm text-[var(--textSecondary)]">Status</span>
                  <Badge variant="info" size="sm">
                    {STAGE_LABELS[selectedCandidate.status] ?? selectedCandidate.status}
                  </Badge>
                </div>
                {selectedCandidate.confirmationStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Confirmation</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.confirmationStatus}</span>
                  </div>
                )}
                {selectedCandidate.acknowledgedStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Acknowledged</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.acknowledgedStatus}</span>
                  </div>
                )}
                {selectedCandidate.reconfirmationStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Reconfirmation</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.reconfirmationStatus}</span>
                  </div>
                )}
                {selectedCandidate.examLinkStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Exam Link</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.examLinkStatus}</span>
                  </div>
                )}
                {selectedCandidate.writtenTestStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Written Test</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.writtenTestStatus}</span>
                  </div>
                )}
                {selectedCandidate.interview && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                    <span className="text-sm text-[var(--textSecondary)]">Interview</span>
                    <span className="text-sm font-medium text-[var(--text)]">{selectedCandidate.interview}</span>
                  </div>
                )}
                {selectedCandidate.rejectionStatus && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <span className="text-sm text-red-600 dark:text-red-400">Rejection</span>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">{selectedCandidate.rejectionStatus}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Resume */}
            {selectedCandidate.resumeFileName && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <FileText size={20} className="text-[var(--primary)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">Resume</p>
                  <p className="text-xs text-[var(--textSecondary)] truncate">{selectedCandidate.resumeFileName}</p>
                </div>
              </div>
            )}

            {/* Match Percent */}
            {selectedCandidate.matchPercent !== undefined && selectedCandidate.matchPercent > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text)]">ATS Match Score</p>
                  <div className="mt-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        selectedCandidate.matchPercent >= 80 ? 'bg-green-500' :
                        selectedCandidate.matchPercent >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(selectedCandidate.matchPercent, 100)}%` }}
                    />
                  </div>
                </div>
                <span className={`text-lg font-bold ${
                  selectedCandidate.matchPercent >= 80 ? 'text-green-500' :
                  selectedCandidate.matchPercent >= 60 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {selectedCandidate.matchPercent.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
