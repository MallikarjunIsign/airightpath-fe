import { useState, useEffect } from 'react';
import { Briefcase, Users, ClipboardList, Video, Loader2, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { jobService } from '@/services/job.service';
import type { JobPostDTO } from '@/types/job.types';

export function AdminDashboardPage() {
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const response = await jobService.getAllJobs();
      setJobs(response.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoading(false);
    }
  }

  const totalJobs = jobs.length;
  const totalOpenings = jobs.reduce((sum, j) => sum + (j.numberOfOpenings ?? 0), 0);
  const activeJobs = jobs.filter(
    (j) => new Date(j.applicationDeadline) >= new Date()
  ).length;

  const stats = [
    {
      label: 'Total Jobs',
      value: totalJobs,
      icon: <Briefcase size={24} />,
      variant: 'primary' as const,
    },
    {
      label: 'Total Openings',
      value: totalOpenings,
      icon: <Users size={24} />,
      variant: 'success' as const,
    },
    {
      label: 'Pending Assessments',
      value: '--',
      icon: <ClipboardList size={24} />,
      variant: 'warning' as const,
    },
    {
      label: 'Active Interviews',
      value: '--',
      icon: <Video size={24} />,
      variant: 'accent' as const,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Admin Dashboard</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Overview of your recruitment pipeline
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            variant={stat.variant}
          />
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-[var(--primary)]" />
            <CardTitle>Recent Job Posts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--textSecondary)] py-8 text-center">
              No jobs posted yet. Create your first job post to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.slice(0, 8).map((job) => {
                const isExpired = new Date(job.applicationDeadline) < new Date();
                return (
                  <div
                    key={job.id ?? job.jobPrefix}
                    className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface1)] border border-[var(--border)] hover:border-[var(--borderHover)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {job.jobTitle}
                      </p>
                      <p className="text-xs text-[var(--textSecondary)] mt-0.5">
                        {job.companyName} &middot; {job.location} &middot; {job.jobPrefix}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <Badge variant={isExpired ? 'error' : 'success'} size="sm">
                        {isExpired ? 'Expired' : 'Active'}
                      </Badge>
                      <span className="text-xs text-[var(--textTertiary)] whitespace-nowrap">
                        {job.numberOfOpenings} opening{job.numberOfOpenings !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Jobs by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const typeCounts: Record<string, number> = {};
              jobs.forEach((j) => {
                const t = j.jobType || 'Other';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
              });
              const entries = Object.entries(typeCounts);
              if (entries.length === 0) {
                return (
                  <p className="text-sm text-[var(--textSecondary)] text-center py-4">
                    No data available
                  </p>
                );
              }
              return (
                <div className="space-y-3">
                  {entries.map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text)]">{type}</span>
                      <Badge variant="info" size="sm">{count}</Badge>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const upcoming = jobs
                .filter((j) => new Date(j.applicationDeadline) >= new Date())
                .sort(
                  (a, b) =>
                    new Date(a.applicationDeadline).getTime() -
                    new Date(b.applicationDeadline).getTime()
                )
                .slice(0, 5);

              if (upcoming.length === 0) {
                return (
                  <p className="text-sm text-[var(--textSecondary)] text-center py-4">
                    No upcoming deadlines
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {upcoming.map((job) => (
                    <div
                      key={job.id ?? job.jobPrefix}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-[var(--text)] truncate mr-3">
                        {job.jobTitle}
                      </span>
                      <span className="text-xs text-[var(--textSecondary)] whitespace-nowrap">
                        {new Date(job.applicationDeadline).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
