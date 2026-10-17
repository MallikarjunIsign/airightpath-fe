import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  ScanSearch,
  UserCheck,
  ClipboardCheck,
  Mic,
  XCircle,
  Loader2,
  Video,
  Monitor,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { interviewService } from '@/services/interview.service';
import { formatElapsedSeconds, formatServerDateTime } from '@/utils/format.utils';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import type { InterviewSchedule } from '@/types/interview.types';
import type { JobApplicationDTO } from '@/types/job.types';

interface CandidateJourneyProps {
  candidate: JobApplicationDTO;
  jobPrefix: string;
  /** Opens the full interview scorecard (transcript, recordings, proctoring). */
  onViewInterviewResult?: (candidate: JobApplicationDTO) => void;
}

type Tone = 'done' | 'pending' | 'bad';

interface Step {
  key: string;
  icon: React.ReactNode;
  title: string;
  tone: Tone;
  when?: string;
  lines: string[];
  badge?: { text: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' };
  extra?: React.ReactNode;
}

const DOT: Record<Tone, string> = {
  done: 'bg-emerald-500 text-white',
  pending: 'bg-[var(--surface2)] text-[var(--textTertiary)] border border-[var(--border)]',
  bad: 'bg-red-500 text-white',
};

/** A status string worth showing: present, and not just a placeholder. */
const meaningful = (value?: string | null) =>
  !!value && !/^(pending|not applicable|n\/a|-+)$/i.test(value.trim());

function secondsBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ms = new Date(b.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(b) ? b : `${b}Z`).getTime()
    - new Date(a.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(a) ? a : `${a}Z`).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}

const partsOf = (references?: string) => (references ?? '').split(/\r?\n/).filter((line) => line.trim()).length;

/**
 * One candidate's whole path through a job, top to bottom: applying, being
 * screened, being shortlisted, the exam, each interview round, and where they
 * stand now.
 *
 * <p>Everything it shows already existed, spread over four screens. A reviewer
 * deciding on one person had to open the application, the exam results and each
 * interview's page separately and assemble the story themselves — and a step
 * that never happened was simply absent from all of them, so a candidate stuck
 * between two stages looked the same as one who had cleared both.</p>
 */
export function CandidateJourney({ candidate, jobPrefix, onViewInterviewResult }: Readonly<CandidateJourneyProps>) {
  const [interviews, setInterviews] = useState<InterviewSchedule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const email = (candidate.userEmail || candidate.email || '').toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setInterviews(null);
    setFailed(false);
    interviewService
      // Removed results too: the journey is the record of what happened, and an
      // admin taking a result off the list does not make the sitting not have
      // happened.
      .getResults(jobPrefix, undefined, { silent: true, includeDeleted: true })
      .then((res) => {
        if (cancelled) return;
        setInterviews(
          (res.data ?? [])
            .filter((row) => row.email?.toLowerCase() === email)
            .sort((a, b) => (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '')),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobPrefix, email]);

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];

    out.push({
      key: 'applied',
      icon: <Briefcase size={14} />,
      title: 'Applied',
      tone: 'done',
      when: formatServerDateTime(candidate.createdAt),
      lines: [
        `${candidate.jobTitle || candidate.jobRole || 'Job'} · ${candidate.jobPrefix}`,
        candidate.experience ? `Experience: ${candidate.experience}` : '',
        candidate.referralName || candidate.referralId
          ? `Referred by ${candidate.referralName ?? candidate.referralId}${candidate.referralStatus ? ` (${candidate.referralStatus.toLowerCase()})` : ''}`
          : '',
      ].filter(Boolean),
    });

    const scanned = meaningful(candidate.atsScanStatus) || (candidate.matchPercent ?? 0) > 0;
    out.push({
      key: 'ats',
      icon: <ScanSearch size={14} />,
      title: 'ATS screening',
      tone: scanned ? 'done' : 'pending',
      lines: scanned
        ? [
            candidate.matchPercent ? `Resume match ${candidate.matchPercent.toFixed(1)}%` : '',
            candidate.atsScanStatus ?? '',
          ].filter(Boolean)
        : ['Not screened yet'],
      badge: meaningful(candidate.shortlistStatus)
        ? {
            text: candidate.shortlistStatus as string,
            variant: /not/i.test(candidate.shortlistStatus as string) ? 'warning' : 'success',
          }
        : undefined,
    });

    const contact = [
      meaningful(candidate.confirmationStatus) && `Confirmation: ${candidate.confirmationStatus}`,
      meaningful(candidate.acknowledgedStatus) && `Acknowledged: ${candidate.acknowledgedStatus}`,
      meaningful(candidate.reconfirmationStatus) && `Reconfirmation: ${candidate.reconfirmationStatus}`,
    ].filter(Boolean) as string[];
    out.push({
      key: 'shortlist',
      icon: <UserCheck size={14} />,
      title: 'Shortlisted and confirmed',
      tone: contact.length > 0 || /shortlist|exam|interview|select|offer/i.test(candidate.status) ? 'done' : 'pending',
      lines: contact.length > 0 ? contact : ['No confirmation recorded'],
    });

    const examLines = [
      meaningful(candidate.examLinkStatus) && `Exam link: ${candidate.examLinkStatus}`,
      meaningful(candidate.examCompletedStatus) && `Exam: ${candidate.examCompletedStatus}`,
      meaningful(candidate.writtenTestStatus) && `Written test: ${candidate.writtenTestStatus}`,
    ].filter(Boolean) as string[];
    out.push({
      key: 'exam',
      icon: <ClipboardCheck size={14} />,
      title: 'Assessments',
      tone: examLines.length > 0 ? 'done' : 'pending',
      lines: examLines.length > 0 ? [...examLines, 'Per-paper scores are in the exam list above.'] : ['No exam recorded'],
    });

    if (interviews === null && !failed) {
      out.push({
        key: 'interviews-loading',
        icon: <Mic size={14} />,
        title: 'Interviews',
        tone: 'pending',
        lines: [],
        extra: <Loader2 size={14} className="animate-spin text-[var(--textSecondary)]" />,
      });
    } else if (failed) {
      out.push({
        key: 'interviews-failed',
        icon: <Mic size={14} />,
        title: 'Interviews',
        tone: 'pending',
        lines: ['Could not load the interviews. Close and reopen to try again.'],
      });
    } else if ((interviews ?? []).length === 0) {
      out.push({
        key: 'interviews-none',
        icon: <Mic size={14} />,
        title: 'Interviews',
        tone: 'pending',
        lines: ['No interview scheduled yet'],
      });
    } else {
      const perRound = new Map<string, number>();
      (interviews ?? []).forEach((row) => {
        const round = row.round ?? 'L2_TECHNICAL';
        const nth = (perRound.get(round) ?? 0) + 1;
        perRound.set(round, nth);
        const label = INTERVIEW_ROUND_LABELS[round] ?? row.roundLabel ?? round;
        const finished = row.attemptStatus === 'COMPLETED';
        const result = row.overriddenResult ?? row.interviewResult;
        const score = row.evaluation?.overallScore;
        const seconds = secondsBetween(row.startedAt, row.endedAt);
        const lines = [
          `Scheduled ${formatServerDateTime(row.assignedAt)}, due ${formatServerDateTime(row.deadlineTime)}`,
          row.startedAt ? `Started ${formatServerDateTime(row.startedAt)}${seconds != null ? ` · ${formatElapsedSeconds(seconds)}` : ''}` : 'Not started',
          score != null ? `Score ${score}/10` : '',
          row.overriddenResult ? `Result overridden by ${row.overriddenBy ?? 'a reviewer'}` : '',
          (row.warningCount ?? row.proctoringWarnings ?? 0) > 0
            ? `${row.warningCount ?? row.proctoringWarnings} proctoring warning(s)`
            : '',
          row.completionReason ? `Ended: ${row.completionReason.toLowerCase().replace(/_/g, ' ')}` : '',
          row.deletedAt ? `Removed from the results list by ${row.deletedBy ?? 'an admin'}${row.deleteReason ? ` — ${row.deleteReason}` : ''}` : '',
        ].filter(Boolean);

        const recordings = [
          { icon: <Video size={12} />, name: 'Camera', n: partsOf(row.recordReferences) },
          { icon: <Monitor size={12} />, name: 'Screen', n: partsOf(row.screenRecordReferences) },
          { icon: <Smartphone size={12} />, name: 'Phone', n: partsOf(row.mobileRecordReferences) },
        ];
        out.push({
          key: `interview-${row.id}`,
          icon: <Mic size={14} />,
          title: `${label}${(interviews ?? []).filter((r) => (r.round ?? 'L2_TECHNICAL') === round).length > 1 ? ` · attempt ${nth}` : ''}`,
          tone: row.deletedAt ? 'pending' : finished ? (result === 'FAILED' ? 'bad' : 'done') : 'pending',
          when: formatServerDateTime(row.endedAt ?? row.startedAt ?? row.assignedAt),
          lines,
          badge: finished
            ? { text: result === 'PASSED' ? 'Passed' : result === 'FAILED' ? 'Failed' : 'Completed', variant: result === 'PASSED' ? 'success' : result === 'FAILED' ? 'error' : 'info' }
            : { text: row.attemptStatus.replace(/_/g, ' ').toLowerCase(), variant: 'warning' },
          extra: (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {recordings.map((rec) => (
                <span
                  key={rec.name}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                    rec.n > 0
                      ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
                      : 'border-dashed border-[var(--border)] text-[var(--textTertiary)]'
                  }`}
                  title={rec.n > 0 ? `${rec.name} recording stored` : `No ${rec.name.toLowerCase()} recording`}
                >
                  {rec.icon}
                  {rec.name}: {rec.n > 0 ? 'saved' : 'none'}
                </span>
              ))}
              {row.needsHumanReview && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle size={12} /> needs human review
                </span>
              )}
            </div>
          ),
        });
      });
    }

    const rejected = meaningful(candidate.rejectionStatus);
    out.push({
      key: 'now',
      icon: rejected ? <XCircle size={14} /> : <UserCheck size={14} />,
      title: rejected ? 'Rejected' : 'Current stage',
      tone: rejected ? 'bad' : 'pending',
      when: formatServerDateTime(candidate.updatedAt),
      lines: [rejected ? (candidate.rejectionStatus as string) : candidate.status.replace(/_/g, ' ')],
    });
    return out;
  }, [candidate, interviews, failed]);

  const anyInterview = (interviews ?? []).length > 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text)]">Journey</h4>
        {anyInterview && onViewInterviewResult && (
          <button
            type="button"
            onClick={() => onViewInterviewResult(candidate)}
            className="text-xs font-medium text-[var(--primary)] hover:underline"
          >
            Open full interview results →
          </button>
        )}
      </div>
      <ol className="relative space-y-4 border-l border-[var(--border)] pl-5">
        {steps.map((step) => (
          <li key={step.key} className="relative">
            <span
              className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full ${DOT[step.tone]}`}
            >
              {step.icon}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[var(--text)]">{step.title}</p>
              {step.badge && (
                <Badge variant={step.badge.variant} size="sm">
                  {step.badge.text}
                </Badge>
              )}
              {step.when && <span className="text-xs text-[var(--textTertiary)]">{step.when}</span>}
            </div>
            {step.lines.map((line) => (
              <p key={line} className="text-xs text-[var(--textSecondary)]">
                {line}
              </p>
            ))}
            {step.extra}
          </li>
        ))}
      </ol>
    </div>
  );
}
