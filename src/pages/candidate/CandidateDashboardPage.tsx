import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardCheck,
  Video,
  Briefcase,
  Trophy,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { interviewService } from '@/services/interview.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { Assessment } from '@/types/assessment.types';
import type { InterviewSchedule } from '@/types/interview.types';

export function CandidateDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user?.email) return;
      setLoading(true);
      try {
        const [assessRes, interviewRes] = await Promise.all([
          assessmentService.getCandidateAssessments(user.email),
          interviewService.getActiveInterviews(user.email),
        ]);
        setAssessments(assessRes.data ?? []);
        setInterviews(interviewRes.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.email]);

  const upcomingAssessments = assessments.filter((a) => !a.examAttended && !a.expired);
  const upcomingInterviews = interviews.filter((i) => i.attemptStatus !== 'COMPLETED');
  const completedAssessments = assessments.filter((a) => a.examAttended);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">
          Welcome back, {user?.firstName || 'Candidate'}!
        </h1>
        <p className="mt-2 text-[var(--textSecondary)]">
          Here is an overview of your activities and upcoming events.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card hover onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--primaryLight)] flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--textSecondary)]">Upcoming Assessments</p>
                <p className="text-2xl font-bold text-[var(--text)]">{upcomingAssessments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card hover onClick={() => navigate(ROUTES.CANDIDATE.INTERVIEWS)}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--accentLight)] flex items-center justify-center">
                <Video className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--textSecondary)]">Upcoming Interviews</p>
                <p className="text-2xl font-bold text-[var(--text)]">{upcomingInterviews.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card hover onClick={() => navigate(ROUTES.CANDIDATE.EVENTS)}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--successLight)] flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-[var(--success)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--textSecondary)]">Application Status</p>
                <p className="text-2xl font-bold text-[var(--text)]">{assessments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card hover onClick={() => navigate(ROUTES.CANDIDATE.RESULTS)}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--warningLight)] flex items-center justify-center">
                <Trophy className="w-6 h-6 text-[var(--warning)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--textSecondary)]">Completed Exams</p>
                <p className="text-2xl font-bold text-[var(--text)]">{completedAssessments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Assessments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-[var(--primary)]" />
                Upcoming Assessments
              </div>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ArrowRight size={16} />}
              onClick={() => navigate(ROUTES.CANDIDATE.ASSESSMENTS)}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingAssessments.length === 0 ? (
            <p className="text-[var(--textSecondary)] text-center py-8">
              No upcoming assessments.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingAssessments.slice(0, 5).map((assessment) => (
                <div
                  key={assessment.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface1)] border border-[var(--border)]"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={assessment.assessmentType === 'APTITUDE' ? 'info' : 'warning'} size="sm">
                      {assessment.assessmentType}
                    </Badge>
                    <div>
                      <p className="font-medium text-[var(--text)]">{assessment.jobPrefix}</p>
                      <p className="text-sm text-[var(--textSecondary)]">
                        Deadline: {formatDate(assessment.deadline)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      navigate(ROUTES.CANDIDATE.INSTRUCTIONS, { state: { assessment } })
                    }
                  >
                    Start
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Interviews */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-[var(--primary)]" />
                Upcoming Interviews
              </div>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ArrowRight size={16} />}
              onClick={() => navigate(ROUTES.CANDIDATE.INTERVIEWS)}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingInterviews.length === 0 ? (
            <p className="text-[var(--textSecondary)] text-center py-8">
              No upcoming interviews.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingInterviews.slice(0, 5).map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface1)] border border-[var(--border)]"
                >
                  <div>
                    <p className="font-medium text-[var(--text)]">{interview.jobPrefix}</p>
                    <p className="text-sm text-[var(--textSecondary)]">
                      Deadline: {formatDate(interview.deadlineTime)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        interview.attemptStatus === 'NOT_ATTEMPTED'
                          ? 'warning'
                          : interview.attemptStatus === 'IN_PROGRESS'
                            ? 'info'
                            : 'success'
                      }
                      size="sm"
                    >
                      {interview.attemptStatus.replace('_', ' ')}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(ROUTES.CANDIDATE.INTERVIEW, { state: { interview } })
                      }
                    >
                      Start
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
