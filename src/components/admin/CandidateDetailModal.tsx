import { Mail, Phone, Clock, Briefcase, MapPin, CheckCircle, XCircle, FileText, Loader2, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReferralFields } from '@/components/application/ReferralFields';
import { getAppEmail } from '@/utils/application.utils';
import { hasReferral, referralStatusLabel } from '@/utils/referral.utils';
import type { JobApplicationDTO } from '@/types/job.types';

interface CandidateDetailModalProps {
  candidate: JobApplicationDTO;
  /** Maps a raw status to its display label (falls back to the raw status). */
  statusLabels: Record<string, string>;
  onClose: () => void;
  onShortlist: (emails: string[]) => void;
  shortlisting: boolean;
  onSetReferralStatus: (candidate: JobApplicationDTO, status: 'VERIFIED' | 'REJECTED') => void;
  validatingReferral: boolean;
  onViewResume: (candidate: JobApplicationDTO) => void;
  resumeLoading: boolean;
}

function statusBadgeVariant(status: string) {
  if (status === 'APPLIED') return 'info';
  if (status === 'SHORTLISTED') return 'success';
  if (status === 'REJECTED') return 'error';
  return 'primary';
}

function referralBadgeVariant(status?: string | null) {
  const s = status?.toUpperCase();
  if (s === 'VERIFIED') return 'success';
  if (s === 'REJECTED') return 'error';
  return 'warning';
}

/** Read-only candidate detail modal with shortlist, referral-verify and resume actions. */
export function CandidateDetailModal({
  candidate,
  statusLabels,
  onClose,
  onShortlist,
  shortlisting,
  onSetReferralStatus,
  validatingReferral,
  onViewResume,
  resumeLoading,
}: Readonly<CandidateDetailModalProps>) {
  const referralStatus = candidate.referralStatus?.toUpperCase();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Candidate Details"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {candidate.status === 'APPLIED' && (
            <Button
              leftIcon={<CheckCircle size={16} />}
              isLoading={shortlisting}
              onClick={() => onShortlist([getAppEmail(candidate)])}
            >
              Shortlist
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-[var(--text)]">
              {candidate.firstName} {candidate.lastName}
            </h3>
            <p className="text-sm text-[var(--textSecondary)] mt-0.5">{getAppEmail(candidate)}</p>
          </div>
          <Badge variant={statusBadgeVariant(candidate.status)} size="sm">
            {statusLabels[candidate.status] ?? candidate.status}
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
                <p className="text-[var(--text)] font-medium">{getAppEmail(candidate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone size={16} className="text-[var(--primary)] flex-shrink-0" />
              <div>
                <p className="text-[var(--textTertiary)] text-xs">Mobile</p>
                <p className="text-[var(--text)] font-medium">{candidate.mobileNumber || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock size={16} className="text-[var(--primary)] flex-shrink-0" />
              <div>
                <p className="text-[var(--textTertiary)] text-xs">Experience</p>
                <p className="text-[var(--text)] font-medium">{candidate.experience}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Briefcase size={16} className="text-[var(--primary)] flex-shrink-0" />
              <div>
                <p className="text-[var(--textTertiary)] text-xs">Applied Role</p>
                <p className="text-[var(--text)] font-medium">{candidate.jobRole || 'N/A'}</p>
              </div>
            </div>
            <ReferralFields
              referralName={candidate.referralName}
              referralId={candidate.referralId}
              alwaysShow
            />
            <div className="flex items-center gap-2 text-sm col-span-full">
              <MapPin size={16} className="text-[var(--primary)] flex-shrink-0" />
              <div>
                <p className="text-[var(--textTertiary)] text-xs">Address</p>
                <p className="text-[var(--text)] font-medium">{candidate.address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral validation — only when the candidate was referred */}
        {hasReferral(candidate.referralName, candidate.referralId) && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Referral</h4>
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--textSecondary)]">Status:</span>
                <Badge variant={referralBadgeVariant(candidate.referralStatus)} size="sm">
                  {referralStatusLabel(candidate.referralStatus)}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<CheckCircle size={14} />}
                  isLoading={validatingReferral}
                  disabled={referralStatus === 'VERIFIED'}
                  onClick={() => onSetReferralStatus(candidate, 'VERIFIED')}
                >
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<XCircle size={14} />}
                  disabled={validatingReferral || referralStatus === 'REJECTED'}
                  onClick={() => onSetReferralStatus(candidate, 'REJECTED')}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Application Status Details */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Application Status</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
              <span className="text-sm text-[var(--textSecondary)]">Status</span>
              <Badge variant="info" size="sm">
                {statusLabels[candidate.status] ?? candidate.status}
              </Badge>
            </div>
            {candidate.confirmationStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Confirmation</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.confirmationStatus}</span>
              </div>
            )}
            {candidate.acknowledgedStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Acknowledged</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.acknowledgedStatus}</span>
              </div>
            )}
            {candidate.reconfirmationStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Reconfirmation</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.reconfirmationStatus}</span>
              </div>
            )}
            {candidate.examLinkStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Exam Link</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.examLinkStatus}</span>
              </div>
            )}
            {candidate.writtenTestStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Written Test</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.writtenTestStatus}</span>
              </div>
            )}
            {candidate.interview && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                <span className="text-sm text-[var(--textSecondary)]">Interview</span>
                <span className="text-sm font-medium text-[var(--text)]">{candidate.interview}</span>
              </div>
            )}
            {candidate.rejectionStatus && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <span className="text-sm text-red-600 dark:text-red-400">Rejection</span>
                <span className="text-sm font-medium text-red-600 dark:text-red-400">{candidate.rejectionStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Resume */}
        {candidate.resumeFileName && (
          <button
            type="button"
            onClick={() => onViewResume(candidate)}
            disabled={resumeLoading}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/[0.04] transition-colors text-left disabled:opacity-60"
          >
            <FileText size={20} className="text-[var(--primary)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)]">Resume</p>
              <p className="text-xs text-[var(--textSecondary)] truncate">{candidate.resumeFileName}</p>
            </div>
            {resumeLoading ? (
              <Loader2 size={16} className="animate-spin text-[var(--primary)] flex-shrink-0" />
            ) : (
              <span className="text-xs text-[var(--primary)] font-medium flex items-center gap-1 flex-shrink-0">
                <Eye size={14} /> View
              </span>
            )}
          </button>
        )}

        {/* Match Percent */}
        {candidate.matchPercent !== undefined && candidate.matchPercent > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text)]">ATS Match Score</p>
              <div className="mt-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    candidate.matchPercent >= 80 ? 'bg-green-500' :
                    candidate.matchPercent >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(candidate.matchPercent, 100)}%` }}
                />
              </div>
            </div>
            <span className={`text-lg font-bold ${
              candidate.matchPercent >= 80 ? 'text-green-500' :
              candidate.matchPercent >= 60 ? 'text-amber-500' : 'text-red-500'
            }`}>
              {candidate.matchPercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
