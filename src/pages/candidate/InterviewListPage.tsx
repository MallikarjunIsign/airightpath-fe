import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Play, Calendar, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { interviewService } from '@/services/interview.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { InterviewSchedule } from '@/types/interview.types';

export function InterviewListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInterviews() {
      if (!user?.email) return;
      setLoading(true);
      try {
        const res = await interviewService.getActiveInterviews(user.email);
        setInterviews(res.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, [user?.email]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NOT_ATTEMPTED':
        return <Badge variant="warning">Not Attempted</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="info">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'PASSED':
        return <Badge variant="success" size="sm">Passed</Badge>;
      case 'FAILED':
        return <Badge variant="error" size="sm">Failed</Badge>;
      case 'PENDING':
        return <Badge variant="secondary" size="sm">Pending</Badge>;
      default:
        return null;
    }
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
      <h1 className="text-3xl font-bold text-[var(--text)]">My Interviews</h1>

      {interviews.length === 0 ? (
        <div className="text-center py-16">
          <Video className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">No interviews scheduled</p>
          <p className="text-[var(--textSecondary)] mt-1">
            You will see your interviews here once they are assigned.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {interviews.map((interview) => (
            <Card key={interview.id} hover>
              <CardContent>
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Video className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--text)]">{interview.jobPrefix}</h3>
                        <p className="text-xs text-[var(--textSecondary)]">AI Interview</p>
                      </div>
                    </div>
                    {getStatusBadge(interview.attemptStatus)}
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Calendar size={14} />
                      <span>Assigned: {formatDate(interview.assignedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Calendar size={14} />
                      <span>Deadline: {formatDate(interview.deadlineTime)}</span>
                    </div>
                    {interview.interviewResult !== 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--textSecondary)]">Result:</span>
                        {getResultBadge(interview.interviewResult)}
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  {interview.attemptStatus !== 'COMPLETED' && (
                    <Button
                      className="w-full"
                      leftIcon={<Play size={16} />}
                      onClick={() =>
                        navigate(ROUTES.CANDIDATE.INTERVIEW, { state: { interview } })
                      }
                    >
                      {interview.attemptStatus === 'IN_PROGRESS' ? 'Continue Interview' : 'Start Interview'}
                    </Button>
                  )}

                  {interview.attemptStatus === 'COMPLETED' && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        navigate(ROUTES.CANDIDATE.INTERVIEW_SUMMARY, {
                          state: { interview },
                        })
                      }
                    >
                      View Summary
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
