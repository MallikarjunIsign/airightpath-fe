import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Play, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { interviewService } from '@/services/interview.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { InterviewSchedule } from '@/types/interview.types';

/** Whether the interview's start time is still ahead. */
function opensLater(interview: InterviewSchedule): boolean {
  if (!interview.assignedAt) return false;
  const opens = new Date(interview.assignedAt).getTime();
  return !Number.isNaN(opens) && opens > Date.now();
}

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
            <Card key={interview.id} hover className="h-full">
              <CardContent className="h-full">
                {/* Every card is the same height and laid out the same way: the title and status on top, three
                    detail rows (the result row is always there), and the button pinned to the bottom. They used to
                    follow their content, so a long job name or a missing result row moved everything below it. */}
                <div className="flex h-full flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <Video className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold text-[var(--text)]" title={interview.jobPrefix}>
                          {interview.jobPrefix}
                        </h3>
                        <p className="text-xs text-[var(--textSecondary)]">AI Interview</p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 whitespace-nowrap">{getStatusBadge(interview.attemptStatus)}</span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex min-h-6 items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Calendar size={14} className="flex-shrink-0" />
                      <span>
                        {opensLater(interview) ? 'Opens' : 'Assigned'}: {formatDate(interview.assignedAt)}
                      </span>
                    </div>
                    <div className="flex min-h-6 items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <Calendar size={14} className="flex-shrink-0" />
                      <span>Deadline: {interview.deadlineTime ? formatDate(interview.deadlineTime) : 'No deadline'}</span>
                    </div>
                    <div className="flex min-h-6 items-center gap-2 text-sm text-[var(--textSecondary)]">
                      <CheckCircle2 size={14} className="flex-shrink-0" />
                      <span>Result:</span>
                      {getResultBadge(interview.interviewResult) ?? <span>—</span>}
                    </div>
                  </div>

                  {/* Action */}
                  {interview.attemptStatus !== 'COMPLETED' && (
                    <Button
                      className="w-full"
                      leftIcon={<Play size={16} />}
                      // Shut until the start time: the server refuses an early start anyway, and a button that
                      // can only fail should not look available.
                      disabled={interview.attemptStatus !== 'IN_PROGRESS' && opensLater(interview)}
                      onClick={() =>
                        navigate(ROUTES.CANDIDATE.INTERVIEW, { state: { interview } })
                      }
                    >
                      {interview.attemptStatus === 'IN_PROGRESS'
                        ? 'Continue Interview'
                        : opensLater(interview)
                          ? 'Not open yet'
                          : 'Start Interview'}
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
