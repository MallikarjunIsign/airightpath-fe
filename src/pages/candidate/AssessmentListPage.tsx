import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Play, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { Assessment } from '@/types/assessment.types';

export function AssessmentListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

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
              const { isExpired, canStart } = assessmentState(assessment);

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
                    <StatusBadge assessment={assessment} isExpired={isExpired} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Assigned</dt>
                      <dd className="text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.assignedAt)}
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
                    Assigned Date
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
                  const { isExpired, canStart } = assessmentState(assessment);

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
                      <td className="px-6 py-4 align-top text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.assignedAt)}
                      </td>
                      <td className="px-6 py-4 align-top text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.deadline)}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <StatusBadge assessment={assessment} isExpired={isExpired} />
                      </td>
                      <td className="px-6 py-4 align-top">
                        <ActionCell
                          assessment={assessment}
                          canStart={canStart}
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

/** Expiry is derived in one place so the badge and the button always agree. */
function assessmentState(assessment: Assessment) {
  const isExpired = assessment.expired || new Date(assessment.deadline) < new Date();
  return { isExpired, canStart: !assessment.examAttended && !isExpired };
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
}: Readonly<{ assessment: Assessment; isExpired: boolean }>) {
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
  return (
    <Badge variant="warning" size="sm">
      Pending
    </Badge>
  );
}

function ActionCell({
  assessment,
  canStart,
  onStart,
  className = '',
}: Readonly<{
  assessment: Assessment;
  canStart: boolean;
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
  return (
    <div className={`flex items-center gap-1 text-sm text-[var(--error)] ${className}`}>
      <AlertCircle size={14} />
      <span>Expired</span>
    </div>
  );
}
