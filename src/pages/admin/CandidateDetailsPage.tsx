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
  BarChart3,
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
import { useJobScoreboard } from '@/hooks/useJobScoreboard';
import { useToast } from '@/components/ui/Toast';
import { ROUTES } from '@/config/routes';
import { getAppEmail } from '@/utils/application.utils';
import { nowDateTimeLocal, isPast } from '@/utils/datetime.utils';
import { MESSAGES } from '@/config/messages';
import type { JobPostDTO, JobApplicationDTO, JobApplicationStatus } from '@/types/job.types';

/**
 * Stages from which an exam can be assigned.
 *
 * RECONFIRMED is the first round of the full pipeline, just before the exam link
 * is sent. EXAM_SENT and EXAM_COMPLETED are included because a round is not
 * always one assignment — aptitude can be set first and coding added once it has
 * been sat — and offering the button only at RECONFIRMED made the second exam
 * unassignable.
 *
 * APPLIED and SHORTLISTED are the direct route, for a recruiter who wants an
 * applicant examined without the ack and reconfirmation round-trip. Assigning
 * from APPLIED shortlists the candidate as part of the same action, so they are
 * recorded as shortlisted rather than skipping the stage.
 */
const ASSIGN_STAGES: JobApplicationStatus[] = [
  'APPLIED',
  'SHORTLISTED',
  'RECONFIRMED',
  'EXAM_SENT',
  'EXAM_COMPLETED',
];

/**
 * Stages where an exam has already been sat, so a result exists to look at.
 *
 * Everything from EXAM_COMPLETED on: a candidate scheduled for an interview or
 * already selected still got there through the paper, and their score is what an
 * admin wants in front of them while they decide the next step. Earlier stages
 * are excluded because the results screen would only have an empty row for them.
 */
const RESULT_STAGES: JobApplicationStatus[] = [
  'EXAM_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
];

/**
 * Stages where a paper has been sent, so there is an assessment to report on.
 *
 * From EXAM_SENT rather than EXAM_COMPLETED: "Exam Sent" is exactly the stage
 * where an admin needs to know *which* paper is outstanding, and whether this
 * candidate is on their second go at it.
 */
const EXAM_STAGES: JobApplicationStatus[] = [
  'EXAM_SENT',
  'EXAM_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
];

/**
 * The pipeline as the admin sees it.
 *
 * ACKNOWLEDGED_BACK is deliberately absent. A candidate acknowledging is now
 * carried straight to RECONFIRMED by the backend, so nothing new ever lands
 * there and a tab for it would only ever read zero. It is still a real status,
 * though — see LEGACY_STAGE.
 */
const STAGES: JobApplicationStatus[] = [
  'APPLIED',
  'SHORTLISTED',
  'ACKNOWLEDGED',
  'RECONFIRMED',
  'EXAM_SENT',
  'EXAM_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
];

/**
 * Retired from the pipeline but still held by applications that reached it
 * before the acknowledgement flow changed. Shown as its own tab only while
 * someone is actually in it, so those candidates stay reachable and can be moved
 * on, and the tab disappears for good once the last one has left.
 */
const LEGACY_STAGE = 'ACKNOWLEDGED_BACK' as JobApplicationStatus;

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  ACKNOWLEDGED: 'Acknowledged',
  // Named after the status, not the action waiting on it. Calling this tab
  // "Reconfirm" put three different things called reconfirm on one screen —
  // this tab, the "Reconfirmed" stage next to it, and the Send Reconfirmation
  // button inside it — and a recruiter could not tell which one they were on.
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

/**
 * Stage-specific actions: only show relevant bulk action buttons per stage.
 *
 * Two rules cut across the table:
 *
 * - Rejection is on every stage. A candidate can drop out of the running at any
 *   point (no-show to the exam, withdrew after the interview), and leaving
 *   stages without it forced admins to push people forward just to reject them.
 * - Reconfirmation sits on ACKNOWLEDGED_BACK and nowhere else, and only to drain
 *   it. Acknowledging now carries a candidate to RECONFIRMED on its own, so
 *   nothing new arrives at that stage; what is already there still needs a way
 *   forward, and this is it.
 */
const STAGE_ACTIONS: Record<string, BulkAction[]> = {
  APPLIED: ['rejection'],
  SHORTLISTED: ['ack', 'rejection'],
  ACKNOWLEDGED: ['rejection'],
  ACKNOWLEDGED_BACK: ['reconfirmation', 'rejection'],
  // Exams reach candidates via Assign Assessment, not from here.
  RECONFIRMED: ['rejection'],
  EXAM_SENT: ['rejection'],
  EXAM_COMPLETED: ['rejection'],
  INTERVIEW_SCHEDULED: ['rejection'],
  INTERVIEW_COMPLETED: ['success', 'rejection'],
  SELECTED: ['rejection'],
};

/**
 * What the assign button says, which differs by where in the pipeline it is:
 *
 * - Applied / Shortlisted skip the ack round-trip, and "Send Exam Directly" is
 *   the promise being made — the candidate is shortlisted and mailed the paper
 *   in one action.
 * - Past the first round it is "another", so nobody reads the button as a way to
 *   re-send the paper already sat.
 */
function assignButtonLabel(stage: JobApplicationStatus): string {
  if (stage === 'APPLIED' || stage === 'SHORTLISTED') return 'Send Exam Directly';
  if (stage === 'RECONFIRMED') return 'Assign Assessment';
  return 'Assign Another Assessment';
}

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

  // Applications left at the retired Ack Back stage; drives its stand-in tab.
  const legacyCount = candidates.filter((c) => c.status === LEGACY_STAGE).length;

  // Count candidates with null/unrecognized status. Ack Back is off the pipeline
  // but still a status we render, so it must not be reported as unrecognized.
  const unknownCount = candidates.filter(
    (c) =>
      !c.status ||
      (!STAGES.includes(c.status as JobApplicationStatus) &&
        c.status !== 'REJECTED' &&
        c.status !== LEGACY_STAGE)
  ).length;

  // The selected stage is persisted between visits, so it can name a tab that is
  // no longer on screen — Ack Back once the last application has left it. Without
  // this the page opens on a stage with nothing highlighted and no rows.
  useEffect(() => {
    if (activeStage === LEGACY_STAGE && legacyCount === 0 && !loadingCandidates) {
      setActiveStage('APPLIED');
    }
  }, [activeStage, legacyCount, loadingCandidates, setActiveStage]);

  /**
   * Scored only for the stage being looked at, not the whole job: the standings
   * cost one request per candidate, and a recruiter on "Applied" is not asking
   * about exam results.
   */
  const showStandings = EXAM_STAGES.includes(activeStage);
  // Every candidate past the send, not just the stage on screen: moving between
  // Exam Sent and Exam Completed is the normal way to work this page, and
  // scoping the load to one stage re-ran the whole thing on each switch.
  const standingEmails = showStandings
    ? candidates
        .filter((c) => EXAM_STAGES.includes(c.status as JobApplicationStatus))
        .map((c) => getAppEmail(c))
        .filter(Boolean)
    : [];
  const { standings, loading: standingsLoading } = useJobScoreboard(
    showStandings ? selectedPrefix : '',
    standingEmails,
  );

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

  /** Where the results screens should send the admin back to. */
  const resultsOrigin = { label: 'Candidates', path: ROUTES.ADMIN.CANDIDATES };

  /**
   * Open Assessment Results for this job.
   *
   * The results screen keeps its own job selection, so seed it before leaving —
   * otherwise the admin lands on a job picker and has to choose the job they
   * were already looking at.
   */
  function handleViewResults() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    writePersistentValue('results:selectedPrefix', selectedPrefix);
    navigate(ROUTES.ADMIN.ASSESSMENTS_RESULTS, { state: { from: resultsOrigin } });
  }

  /** Straight to one candidate's scorecard, skipping the results list. */
  function handleViewCandidateResult(candidate: JobApplicationDTO) {
    const email = getAppEmail(candidate);
    if (!selectedPrefix || !email) return;
    writePersistentValue('results:selectedPrefix', selectedPrefix);
    navigate(ROUTES.ADMIN.candidateResultDetail(selectedPrefix, email), {
      state: { from: resultsOrigin },
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
                {/* Ack Back — off the pipeline, and only here while applications
                    that predate the current acknowledgement flow are still in it.
                    Amber rather than the pipeline styling: it is a place to empty,
                    not a step anybody should be aiming for. */}
                {legacyCount > 0 && (
                  <div className="flex items-center flex-shrink-0 ml-4 pl-4 border-l border-[var(--border)]">
                    <button
                      onClick={() => {
                        setActiveStage(LEGACY_STAGE);
                        setSelectedEmails(new Set());
                      }}
                      title="Retired stage — acknowledging now moves a candidate straight to Reconfirmed"
                      className={`
                        flex flex-col items-center px-3 py-2 rounded-lg transition-all duration-200
                        ${activeStage === LEGACY_STAGE
                          ? 'bg-amber-500 text-white'
                          : 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600'
                        }
                      `}
                    >
                      <span className="text-xs font-semibold whitespace-nowrap">Ack Back</span>
                      <span
                        className={`text-lg font-bold ${activeStage === LEGACY_STAGE ? 'text-white' : 'text-amber-600'}`}
                      >
                        {legacyCount}
                      </span>
                    </button>
                  </div>
                )}
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
            RESULT_STAGES.includes(activeStage) ||
            ASSIGN_STAGES.includes(activeStage)) && (
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
              {ASSIGN_STAGES.includes(activeStage) && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<ClipboardList size={16} />}
                  onClick={handleAssignAssessment}
                >
                  {assignButtonLabel(activeStage)}
                </Button>
              )}
              {/* Once the paper has been sat, the score is the next thing an
                  admin looks at — this is the shortcut to it for the whole job,
                  with the per-row action going straight to one scorecard. */}
              {RESULT_STAGES.includes(activeStage) && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<BarChart3 size={16} />}
                  onClick={handleViewResults}
                >
                  View Assessment Results
                </Button>
              )}
              {availableActions.map((key) => {
                const config = BULK_ACTION_CONFIG[key];
                return (
                  <Button
                    key={key}
                    // Rejection carries the red fill on every stage, so the one
                    // action that takes a candidate out of the running never
                    // reads like the outline buttons that move them along.
                    variant={key === 'rejection' ? 'danger' : 'outline'}
                    size="sm"
                    leftIcon={config.icon}
                    onClick={() => openActionModal(key)}
                  >
                    {config.label}
                    {selectedEmails.size > 0 ? ` (${selectedEmails.size})` : ''}
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
                  onViewResult={
                    RESULT_STAGES.includes(activeStage) ? handleViewCandidateResult : undefined
                  }
                  statusLabels={STAGE_LABELS}
                  standings={showStandings ? standings : undefined}
                  standingsLoading={standingsLoading}
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
          jobPrefix={selectedPrefix}
          onViewResult={
            RESULT_STAGES.includes(selectedCandidate.status as JobApplicationStatus)
              ? handleViewCandidateResult
              : undefined
          }
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
