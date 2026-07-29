import { Mail, Phone, Clock, Briefcase, MapPin, FileText, Loader2, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReferralFields } from '@/components/application/ReferralFields';
import { getAppEmail } from '@/utils/application.utils';
import { getScoreColor, getScoreBg } from '@/utils/score.utils';
import type { JobApplicationDTO } from '@/types/job.types';

interface AtsCandidateDetailModalProps {
  candidate: JobApplicationDTO;
  onClose: () => void;
  onViewResume: (candidate: JobApplicationDTO) => void;
  resumeLoading: boolean;
}

function scoreVerdict(score: number): { title: string; detail: string } {
  if (score >= 80) {
    return {
      title: 'Excellent Match',
      detail:
        "This candidate's resume strongly matches the job requirements. Highly recommended for the next stage.",
    };
  }
  if (score >= 60) {
    return {
      title: 'Good Match - Above Threshold',
      detail:
        'This candidate meets the minimum screening criteria. Consider for further evaluation.',
    };
  }
  return {
    title: 'Below Threshold',
    detail:
      "This candidate's resume does not sufficiently match the job requirements. Resume skills, experience, or education may not align.",
  };
}

/** Read-only ATS screening detail for a candidate (score, breakdown, resume). */
export function AtsCandidateDetailModal({
  candidate,
  onClose,
  onViewResume,
  resumeLoading,
}: Readonly<AtsCandidateDetailModalProps>) {
  const score = candidate.matchPercent ?? 0;
  const shortlisted = candidate.shortlistStatus
    ? !/not/i.test(candidate.shortlistStatus)
    : candidate.status === 'SHORTLISTED';
  const verdict = scoreVerdict(score);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Candidate Screening Details"
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Header with Score */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-[var(--text)]">
              {candidate.firstName} {candidate.lastName}
            </h3>
            <p className="text-sm text-[var(--textSecondary)] mt-0.5">{getAppEmail(candidate)}</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getScoreColor(score)}`}>{score.toFixed(1)}%</div>
            <div className="flex flex-col items-end gap-1 mt-1">
              <Badge variant={shortlisted ? 'success' : 'error'} size="sm">
                {candidate.shortlistStatus ?? (shortlisted ? 'Shortlisted' : 'Rejected')}
              </Badge>
              {candidate.atsScanStatus && (
                <Badge variant={/complet/i.test(candidate.atsScanStatus) ? 'info' : 'warning'} size="sm">
                  {candidate.atsScanStatus}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[var(--textSecondary)]">ATS Match Score</span>
            <span className={`text-sm font-medium ${getScoreColor(score)}`}>{score.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getScoreBg(score)}`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-[var(--textTertiary)]">0%</span>
            <span className="text-xs text-[var(--textTertiary)] flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              60% threshold
            </span>
            <span className="text-xs text-[var(--textTertiary)]">100%</span>
          </div>
        </div>

        {/* Personal Details */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)] mb-3">Candidate Information</h4>
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

        {/* Score Interpretation */}
        <div className={`p-4 rounded-lg border ${
          score >= 80
            ? 'bg-[var(--successLight)] border-[var(--success)]/20'
            : score >= 60
              ? 'bg-[var(--warningLight)] border-[var(--warning)]/20'
              : 'bg-[var(--errorLight)] border-[var(--error)]/20'
        }`}>
          <div className="flex items-start gap-3">
            {score >= 60 ? (
              <TrendingUp size={20} className="text-[var(--success)] flex-shrink-0 mt-0.5" />
            ) : (
              <TrendingDown size={20} className="text-[var(--error)] flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-medium text-[var(--text)]">{verdict.title}</p>
              <p className="text-xs text-[var(--textSecondary)] mt-1">{verdict.detail}</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
