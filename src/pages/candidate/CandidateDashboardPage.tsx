import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  Video,
  Briefcase,
  Trophy,
  ArrowRight,
  Loader2,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { interviewService } from '@/services/interview.service';
import { jobApplicationService } from '@/services/job-application.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { formatDate, formatDateTime } from '@/utils/format.utils';
import { useNow } from '@/hooks/useNow';
import type { Assessment } from '@/types/assessment.types';
import type { InterviewSchedule } from '@/types/interview.types';
import type { JobApplicationDTO } from '@/types/job.types';

export function CandidateDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [applications, setApplications] = useState<JobApplicationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user?.email) return;
      setLoading(true);
      try {
        // getAllAssessmentsForCandidate, not getCandidateAssessments: the latter
        // filters server-side to examAttended = false, so a "Completed Exams"
        // count taken from it could only ever be zero.
        // Applications are a separate resource — the count of assessments says
        // nothing about how many jobs were applied to.
        const [assessRes, interviewRes, applicationRes] = await Promise.all([
          assessmentService.getAllAssessmentsForCandidate(user.email),
          interviewService.getActiveInterviews(user.email),
          jobApplicationService.getByEmail(user.email).catch(() => null),
        ]);
        setAssessments(assessRes.data ?? []);
        setInterviews(interviewRes.data ?? []);
        setApplications(applicationRes?.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.email]);

  // `expired` is set by a scheduled sweep, so a deadline that passed minutes ago
  // may not be flagged yet — check the date too, as the assessments table does.
  const now = useNow().getTime();
  const isExpired = (a: Assessment) =>
    a.expired || new Date(a.deadline).getTime() < now;

  /**
   * An assignment can be scheduled to open later. Same rule as the assessments
   * list — an exam still inside its window cannot be started from here either,
   * or this card would be the way around it.
   */
  const startsLater = (a: Assessment) => {
    if (!a.startTime) return false;
    const startsAt = new Date(a.startTime).getTime();
    return Number.isFinite(startsAt) && startsAt > now;
  };

  const upcomingAssessments = assessments.filter((a) => !a.examAttended && !isExpired(a));
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

        {/* Counts applications, and links to the page that lists them. It used
            to show the assessment count under an "Application Status" label,
            which made it a duplicate of the first card with a misleading name. */}
        <Card hover onClick={() => navigate(ROUTES.CANDIDATE.APPLICATIONS)}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--successLight)] flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-[var(--success)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--textSecondary)]">Jobs Applied</p>
                <p className="text-2xl font-bold text-[var(--text)]">{applications.length}</p>
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
                  className="flex items-center justify-between gap-3 p-4 rounded-lg bg-[var(--surface1)] border border-[var(--border)]"
                >
                  {/* min-w-0 down the chain: without it a long job prefix grows
                      the row past the card and takes the Start button off the
                      side of a phone screen. */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant={assessment.assessmentType === 'APTITUDE' ? 'info' : 'warning'}
                      size="sm"
                      className="flex-shrink-0"
                    >
                      {assessment.assessmentType}
                    </Badge>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text)] break-words">
                        {assessment.jobPrefix}
                      </p>
                      <p className="text-sm text-[var(--textSecondary)]">
                        {startsLater(assessment)
                          ? `Opens: ${formatDateTime(assessment.startTime!)}`
                          : `Deadline: ${formatDate(assessment.deadline)}`}
                      </p>
                    </div>
                  </div>
                  {startsLater(assessment) ? (
                    <span className="flex-shrink-0 flex items-center gap-1.5 text-sm text-[var(--textSecondary)]">
                      <Clock size={14} />
                      Scheduled
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() =>
                        navigate(ROUTES.CANDIDATE.INSTRUCTIONS, { state: { assessment } })
                      }
                    >
                      Start
                    </Button>
                  )}
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
