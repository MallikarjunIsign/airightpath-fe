import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  Users,
  Mail,
  XCircle,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  FileText,
  ClipboardList,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { CandidateTable } from '@/components/admin/CandidateTable';
import { CandidateDetailModal } from '@/components/admin/CandidateDetailModal';
import { BulkActionModal } from '@/components/admin/BulkActionModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { BackLink } from '@/components/ui/BackLink';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { resumeService } from '@/services/resume.service';
import axios from 'axios';
import { usePersistentState, writePersistentValue } from '@/hooks/usePersistentState';
import { useToast } from '@/components/ui/Toast';
import { ROUTES } from '@/config/routes';
import { getAppEmail } from '@/utils/application.utils';
import { nowDateTimeLocal, isPast } from '@/utils/datetime.utils';
import { MESSAGES } from '@/config/messages';
import type { JobPostDTO, JobApplicationDTO, JobApplicationStatus } from '@/types/job.types';

// Assessments are assigned at the RECONFIRMED stage, just before the exam link is sent.
const ASSIGN_STAGE: JobApplicationStatus = 'RECONFIRMED';

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

// "Send Exam Link" used to live here. Assigning an assessment is the single way
// an exam reaches a candidate now, so a second route that only mailed a link —
// and had to pre-check that an assessment existed before it could safely send —
// was a way to get the two out of step.
type BulkAction =
  | 'ack'
  | 'rejection'
  | 'reconfirmation'
  | 'success'
  | 'failure';

const BULK_ACTION_CONFIG: Record<
  BulkAction,
  { label: string; hasDateTime: boolean; icon: React.ReactNode }
> = {
  ack: { label: 'Send Ack Mail', hasDateTime: true, icon: <Mail size={16} /> },
  rejection: { label: 'Send Rejection', hasDateTime: false, icon: <XCircle size={16} /> },
  reconfirmation: { label: 'Send Reconfirmation', hasDateTime: false, icon: <RefreshCw size={16} /> },
  success: { label: 'Send Success', hasDateTime: false, icon: <CheckCircle size={16} /> },
  failure: { label: 'Send Failure', hasDateTime: false, icon: <AlertTriangle size={16} /> },
};

// Stage-specific actions: only show relevant bulk action buttons per stage
const STAGE_ACTIONS: Record<string, BulkAction[]> = {
  APPLIED: [],
  SHORTLISTED: ['ack', 'rejection'],
  ACKNOWLEDGED: [],
  ACKNOWLEDGED_BACK: ['reconfirmation', 'rejection'],
  // Exams reach candidates via Assign Assessment, not from here.
  RECONFIRMED: ['rejection'],
  EXAM_SENT: [],
  EXAM_COMPLETED: ['rejection'],
  INTERVIEW_SCHEDULED: [],
  INTERVIEW_COMPLETED: ['success', 'rejection'],
  SELECTED: [],
};

export function CandidateDetailsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = usePersistentState('candidates:selectedPrefix', '');
  const [activeStage, setActiveStage] = usePersistentState<JobApplicationStatus>('candidates:activeStage', 'APPLIED');
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

  // Manual shortlist / referral validation in-flight flags
  const [shortlisting, setShortlisting] = useState(false);
  const [validatingReferral, setValidatingReferral] = useState(false);

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
      showToast(MESSAGES.admin.common.selectCandidate, 'warning');
      return;
    }
    setModalAction(action);
    setModalDateTime('');
    setModalContent('');
  }

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

  /**
   * Hands the ATS page the job and, when rows are ticked, exactly which
   * candidates to screen — screening the whole job when the admin picked three
   * people is what made ATS feel like it ignored the selection.
   */
  function handleScreenAts() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    writePersistentValue('ats:selectedPrefix', selectedPrefix);
    writePersistentValue('ats:scopeEmails', Array.from(selectedEmails));
    navigate(ROUTES.ADMIN.ATS, {
      state: { from: { label: 'Candidates', path: ROUTES.ADMIN.CANDIDATES } },
    });
  }

  // Manually shortlist candidates (Applied → Shortlisted) without ATS screening.
  /**
   * Manually shortlist. `override` reopens a REJECTED application — the backend
   * treats REJECTED as terminal without it, so "Shortlist Anyway" would fail on
   * exactly the case it exists for. It also clears the rejection server-side,
   * so the candidate can be screened again afterwards.
   */
  async function handleShortlist(emails: string[], override = false) {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    if (emails.length === 0) {
      showToast(MESSAGES.admin.candidates.selectToShortlist, 'warning');
      return;
    }
    setShortlisting(true);
    try {
      await jobApplicationService.shortlist({ jobPrefix: selectedPrefix, emails, override });

      // The endpoint can partially succeed, so trust the read state rather than
      // assuming all requested emails were shortlisted: after success a candidate
      // flips to status SHORTLISTED. Re-read and count who actually moved.
      const res = await jobApplicationService.getByPrefix(selectedPrefix);
      const data = res.data ?? [];
      setCandidates(data);

      const requested = new Set(emails.map((e) => e.toLowerCase()));
      const done = data.filter(
        (c) => requested.has(getAppEmail(c).toLowerCase()) && c.status === 'SHORTLISTED',
      ).length;
      const failed = emails.length - done;

      if (failed <= 0) {
        showToast(MESSAGES.admin.candidates.shortlisted(done), 'success');
      } else if (done === 0) {
        showToast(MESSAGES.admin.candidates.shortlistFailed(failed), 'error');
      } else {
        showToast(
          MESSAGES.admin.candidates.shortlistPartial(done, emails.length, failed),
          'warning',
        );
      }

      setSelectedEmails(new Set());
      setSelectedCandidate(null);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setShortlisting(false);
    }
  }

  // Admin sets a candidate's referral status (verify / reject).
  async function handleSetReferralStatus(
    candidate: JobApplicationDTO,
    referralStatus: 'VERIFIED' | 'REJECTED',
  ) {
    const email = getAppEmail(candidate);
    if (!selectedPrefix || !email) return;
    setValidatingReferral(true);
    try {
      await jobApplicationService.setReferralStatus({
        jobPrefix: selectedPrefix,
        email,
        referralStatus,
      });
      showToast(MESSAGES.admin.candidates.referralSet(referralStatus === 'VERIFIED'), 'success');
      // Reflect immediately in the open modal and the list.
      setSelectedCandidate((prev) => (prev ? { ...prev, referralStatus } : prev));
      setCandidates((prev) =>
        prev.map((c) => (getAppEmail(c) === email ? { ...c, referralStatus } : c)),
      );
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setValidatingReferral(false);
    }
  }

  // Go to the Assign page with this job + the selected candidates pre-selected.
  function handleAssignAssessment() {
    if (selectedEmails.size === 0) {
      showToast(MESSAGES.admin.common.selectCandidate, 'warning');
      return;
    }
    navigate(ROUTES.ADMIN.ASSESSMENTS_ASSIGN, {
      state: {
        jobPrefix: selectedPrefix,
        emails: Array.from(selectedEmails),
        from: { label: 'Candidates', path: ROUTES.ADMIN.CANDIDATES },
      },
    });
  }

  async function handleSendAction() {
    if (!modalAction || !selectedPrefix) return;

    // Require dateTime for ack mail (email contains exam schedule)
    if (modalAction === 'ack' && !modalDateTime) {
      showToast(MESSAGES.admin.candidates.ackDateTimeRequired, 'warning');
      return;
    }

    // A schedule the candidate cannot make is worse than no email at all —
    // the picker blocks past slots, this catches a value that went stale
    // while the modal was open.
    if (modalDateTime && isPast(modalDateTime)) {
      showToast(MESSAGES.admin.candidates.dateTimeInPast, 'warning');
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
        case 'success':
          await jobApplicationService.sendSuccessMail(payload);
          break;
        case 'failure':
          await jobApplicationService.sendFailureMail(payload);
          break;
      }
      showToast(MESSAGES.admin.candidates.actionSent(BULK_ACTION_CONFIG[modalAction].label), 'success');
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
      {/* Shown only when another screen sent us here */}
      <BackLink />

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Candidate Details</h1>
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
              searchable
              searchPlaceholder="Search by job title or prefix..."
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

          {/* Bulk Actions — stage-relevant: Applied → ATS screening, Shortlisted →
              Assign, Rejected → put a candidate back in the running. */}
          {(availableActions.length > 0 ||
            activeStage === ('APPLIED' as JobApplicationStatus) ||
            activeStage === ('REJECTED' as JobApplicationStatus) ||
            activeStage === ASSIGN_STAGE) && (
            <div className="flex flex-wrap gap-2">
              {activeStage === ('APPLIED' as JobApplicationStatus) && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<FileText size={16} />}
                    onClick={handleScreenAts}
                  >
                    {selectedEmails.size > 0
                      ? `Screen ${selectedEmails.size} Selected with ATS`
                      : 'Screen with ATS'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<CheckCircle size={16} />}
                    isLoading={shortlisting}
                    onClick={() => handleShortlist(Array.from(selectedEmails))}
                  >
                    Shortlist Selected
                  </Button>
                </>
              )}

              {/* An ATS rejection is a judgement, not a dead end — the admin can
                  overrule it or send the candidate back through screening. */}
              {activeStage === ('REJECTED' as JobApplicationStatus) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<CheckCircle size={16} />}
                    isLoading={shortlisting}
                    onClick={() => handleShortlist(Array.from(selectedEmails), true)}
                  >
                    Shortlist Anyway
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<RefreshCw size={16} />}
                    onClick={handleScreenAts}
                  >
                    {selectedEmails.size > 0
                      ? `Re-screen ${selectedEmails.size} with ATS`
                      : 'Re-screen with ATS'}
                  </Button>
                </>
              )}
              {activeStage === ASSIGN_STAGE && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<ClipboardList size={16} />}
                  onClick={handleAssignAssessment}
                >
                  Assign Assessment
                </Button>
              )}
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
                <CandidateTable
                  candidates={filteredCandidates}
                  selectedEmails={selectedEmails}
                  onToggleEmail={toggleEmail}
                  onToggleAll={toggleAll}
                  onView={setSelectedCandidate}
                  statusLabels={STAGE_LABELS}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Bulk Action Modal */}
      {modalAction && (
        <BulkActionModal
          title={BULK_ACTION_CONFIG[modalAction].label}
          hasDateTime={BULK_ACTION_CONFIG[modalAction].hasDateTime}
          dateTimeRequired={modalAction === 'ack'}
          recipientCount={selectedEmails.size}
          sending={sending}
          dateTime={modalDateTime}
          onDateTimeChange={setModalDateTime}
          minDateTime={nowDateTimeLocal()}
          content={modalContent}
          onContentChange={setModalContent}
          onClose={() => setModalAction(null)}
          onSend={handleSendAction}
        />
      )}

      {/* Candidate Detail Modal */}
      {selectedCandidate && (
        <CandidateDetailModal
          candidate={selectedCandidate}
          statusLabels={STAGE_LABELS}
          onClose={() => setSelectedCandidate(null)}
          onShortlist={handleShortlist}
          shortlisting={shortlisting}
          onSetReferralStatus={handleSetReferralStatus}
          validatingReferral={validatingReferral}
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
