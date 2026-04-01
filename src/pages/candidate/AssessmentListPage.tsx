import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Play, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
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
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Type
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Job
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Assigned Date
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Deadline
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((assessment) => {
                  const isExpired = assessment.expired || new Date(assessment.deadline) < new Date();
                  const canStart = !assessment.examAttended && !isExpired;

                  return (
                    <tr
                      key={assessment.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface1)] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Badge
                          variant={assessment.assessmentType === 'APTITUDE' ? 'info' : 'warning'}
                          size="sm"
                        >
                          {assessment.assessmentType}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text)]">
                        {assessment.jobPrefix}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.assignedAt)}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--textSecondary)]">
                        {formatDate(assessment.deadline)}
                      </td>
                      <td className="px-6 py-4">
                        {assessment.examAttended ? (
                          <Badge variant="success" size="sm">
                            Attended
                          </Badge>
                        ) : isExpired ? (
                          <Badge variant="error" size="sm">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canStart ? (
                          <Button
                            size="sm"
                            leftIcon={<Play size={14} />}
                            onClick={() => handleStart(assessment)}
                          >
                            Start
                          </Button>
                        ) : assessment.examAttended ? (
                          <span className="text-sm text-[var(--textSecondary)]">Completed</span>
                        ) : (
                          <div className="flex items-center gap-1 text-sm text-[var(--error)]">
                            <AlertCircle size={14} />
                            <span>Expired</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
