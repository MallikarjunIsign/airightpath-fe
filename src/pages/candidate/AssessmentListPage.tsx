import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Play, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { formatDate, formatDateTime } from '@/utils/format.utils';
import { useNow } from '@/hooks/useNow';
import type { Assessment } from '@/types/assessment.types';

export function AssessmentListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  // Ticks, so an exam scheduled for 18:00 unlocks itself for a candidate who is
  // already sitting on this page rather than waiting for them to reload.
  const now = useNow();

  useEffect(() => {
    async function fetchAssessments() {
      if (!user?.email) return;
      setLoading(true);
      try {
        const res = await assessmentService.getCandidateAssessments(user.email);
        setAssessments(res.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchAssessments();
  }, [user?.email]);

  const handleStart = (assessment: Assessment) => {
    navigate(ROUTES.CANDIDATE.INSTRUCTIONS, { state: { assessment } });
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
      <h1 className="text-3xl font-bold text-[var(--text)]">My Assessments</h1>

      {assessments.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">No assessments assigned</p>
          <p className="text-[var(--textSecondary)] mt-1">
            Check back later for new assessment assignments.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: one card per assessment. Six columns — two of them dates —
              only fit by scrolling sideways, which pushed the Start button off
              the screen whose whole purpose is to press it. */}
          <div className="md:hidden space-y-3">
            {assessments.map((assessment) => {
              const { isExpired, canStart, notOpenYet, startsAt } = assessmentState(
                assessment,
                now,
              );

              return (
                <div
                  key={assessment.id}
                  className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <TypeBadge type={assessment.assessmentType} />
                      <p className="font-medium text-[var(--text)] break-words">
                        {assessment.jobPrefix}
                      </p>
                    </div>
                    <StatusBadge
                      assessment={assessment}
                      isExpired={isExpired}
                      notOpenYet={notOpenYet}
                    />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      {/* The start time is the actionable one, so it takes the
                          slot when there is one; the assigned date is only
                          bookkeeping. */}
                      <dt className="text-xs text-[var(--textTertiary)] mb-0.5">
                        {startsAt ? 'Starts' : 'Assigned'}
                      </dt>
                      <dd className="text-sm text-[var(--textSecondary)]">
                        {startsAt
                          ? formatDateTime(startsAt.toISOString())
                          : formatDate(assessment.assignedAt)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Deadline</dt>
                      <dd className="text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.deadline)}
                      </dd>
                    </div>
                  </dl>

                  <ActionCell
                    assessment={assessment}
                    canStart={canStart}
                    notOpenYet={notOpenYet}
                    startsAt={startsAt}
                    onStart={handleStart}
                    className="w-full justify-center text-center"
                  />
                </div>
              );
            })}
          </div>

          {/* Desktop: fixed layout so a long job prefix wraps instead of
              stretching the table past the card. */}
          <Card padding="none" className="hidden md:block overflow-hidden">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[14%]">
                    Type
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[22%]">
                    Job
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[17%]">
                    Starts
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[17%]">
                    Deadline
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[15%]">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)] w-[15%]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((assessment) => {
                  const { isExpired, canStart, notOpenYet, startsAt } = assessmentState(
                    assessment,
                    now,
                  );

                  return (
                    <tr
                      key={assessment.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface1)] transition-colors"
                    >
                      <td className="px-6 py-4 align-top">
                        <TypeBadge type={assessment.assessmentType} />
                      </td>
                      <td className="px-6 py-4 align-top text-sm text-[var(--text)] break-words">
                        {assessment.jobPrefix}
                      </td>
                      {/* The window the candidate is waiting on, to the minute.
                          A date alone cannot answer "can I sit it now?" for an
                          exam that opens at 18:00. */}
                      <td className="px-6 py-4 align-top text-sm text-[var(--textSecondary)]">
                        {startsAt
                          ? formatDateTime(startsAt.toISOString())
                          : formatDate(assessment.assignedAt)}
                      </td>
                      <td className="px-6 py-4 align-top text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.deadline)}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <StatusBadge
                          assessment={assessment}
                          isExpired={isExpired}
                          notOpenYet={notOpenYet}
                        />
                      </td>
                      <td className="px-6 py-4 align-top">
                        <ActionCell
                          assessment={assessment}
                          canStart={canStart}
                          notOpenYet={notOpenYet}
                          startsAt={startsAt}
                          onStart={handleStart}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────
// Shared by the desktop row and the mobile card so the two renderings cannot
// drift apart.

/**
 * The window an assessment sits in, derived in one place so the badge, the
 * button and the caption can never disagree.
 *
 * An assignment carries a start time as well as a deadline, and the start time
 * was being ignored: an exam scheduled for 18:00 could be opened the moment it
 * was assigned. It is now closed until its window opens — the candidate can see
 * it and see when it begins, but not sit it early.
 */
function assessmentState(assessment: Assessment, now: Date) {
  const startsAt = parseDate(assessment.startTime);
  const notOpenYet = !!startsAt && startsAt > now;
  const isExpired = assessment.expired || new Date(assessment.deadline) < now;
  return {
    startsAt,
    notOpenYet,
    isExpired,
    canStart: !assessment.examAttended && !isExpired && !notOpenYet,
  };
}

/** An unparseable or absent timestamp is treated as "no start time set". */
function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function TypeBadge({ type }: Readonly<{ type: Assessment['assessmentType'] }>) {
  return (
    <Badge variant={type === 'APTITUDE' ? 'info' : 'warning'} size="sm">
      {type}
    </Badge>
  );
}

function StatusBadge({
  assessment,
  isExpired,
  notOpenYet,
}: Readonly<{ assessment: Assessment; isExpired: boolean; notOpenYet?: boolean }>) {
  if (assessment.examAttended) {
    return (
      <Badge variant="success" size="sm">
        Attended
      </Badge>
    );
  }
  if (isExpired) {
    return (
      <Badge variant="error" size="sm">
        Expired
      </Badge>
    );
  }
  // "Pending" would read as "waiting for you"; this one is waiting for a clock.
  if (notOpenYet) {
    return (
      <Badge variant="info" size="sm">
        Scheduled
      </Badge>
    );
  }
  return (
    <Badge variant="warning" size="sm">
      Pending
    </Badge>
  );
}

function ActionCell({
  assessment,
  canStart,
  notOpenYet,
  startsAt,
  onStart,
  className = '',
}: Readonly<{
  assessment: Assessment;
  canStart: boolean;
  notOpenYet?: boolean;
  startsAt?: Date | null;
  onStart: (assessment: Assessment) => void;
  /** Lets the mobile card stretch the button to the full card width. */
  className?: string;
}>) {
  if (canStart) {
    return (
      <Button
        size="sm"
        className={className}
        leftIcon={<Play size={14} />}
        onClick={() => onStart(assessment)}
      >
        Start
      </Button>
    );
  }
  if (assessment.examAttended) {
    return (
      <span className={`block text-sm text-[var(--textSecondary)] ${className}`}>Completed</span>
    );
  }
  // Naming the moment it opens, not just refusing: "Locked" on its own leaves
  // the candidate checking back at random, or mailing to ask.
  if (notOpenYet) {
    return (
      <div className={`flex items-start gap-1.5 text-sm text-[var(--textSecondary)] ${className}`}>
        <Clock size={14} className="mt-0.5 flex-shrink-0" />
        <span className="min-w-0">
          <span className="block">Starts</span>
          <span className="block text-xs text-[var(--textTertiary)]">
            {startsAt ? formatDateTime(startsAt.toISOString()) : '--'}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1 text-sm text-[var(--error)] ${className}`}>
      <AlertCircle size={14} />
      <span>Expired</span>
    </div>
  );
}
