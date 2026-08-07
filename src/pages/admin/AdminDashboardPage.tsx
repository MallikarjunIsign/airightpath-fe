import { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  CheckCircle,
  CalendarX,
  Clock,
  ClipboardList,
  Video,
  Loader2,
  Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { jobService } from '@/services/job.service';
import {
  canonicalJobType,
  deadlineUrgency,
  deadlineColor,
  deadlineLabel,
  DEADLINE_SOON_DAYS,
} from '@/utils/job.utils';
import { isJobExpired } from '@/hooks/useJobListing';
import { formatDate } from '@/utils/format.utils';
import type { JobPostDTO } from '@/types/job.types';

/** How many entries the "Recent Job Posts" panel lists. */
const RECENT_JOBS_LIMIT = 8;

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

  const openingsOf = (list: JobPostDTO[]) =>
    list.reduce((sum, j) => sum + (j.numberOfOpenings ?? 0), 0);

  const activeJobs = jobs.filter((j) => !isJobExpired(j));
  const expiredJobs = jobs.filter((j) => isJobExpired(j));

  // "Recent" means newest first — the API's own order is not guaranteed to be.
  const recentJobs = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => {
          const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (at !== bt) return bt - at;
          return (b.id ?? 0) - (a.id ?? 0);
        })
        .slice(0, RECENT_JOBS_LIMIT),
    [jobs],
  );

  const stats = [
    {
      label: 'Total Jobs',
      value: jobs.length,
      caption: `${openingsOf(jobs)} positions in total`,
      icon: <Briefcase size={24} />,
      variant: 'primary' as const,
    },
    {
      label: 'Active Jobs',
      value: activeJobs.length,
      caption: `${openingsOf(activeJobs)} open positions`,
      icon: <CheckCircle size={24} />,
      variant: 'success' as const,
    },
    {
      label: 'Expired Jobs',
      value: expiredJobs.length,
      caption: `${openingsOf(expiredJobs)} positions closed`,
      icon: <CalendarX size={24} />,
      variant: 'error' as const,
    },
    {
      label: 'Closing Soon',
      value: activeJobs.filter((j) => deadlineUrgency(j.applicationDeadline) === 'soon').length,
      caption: `Deadline within ${DEADLINE_SOON_DAYS} days`,
      icon: <Clock size={24} />,
      variant: 'warning' as const,
    },
    {
      label: 'Pending Assessments',
      value: '--',
      caption: 'Not tracked yet',
      icon: <ClipboardList size={24} />,
      variant: 'info' as const,
    },
    {
      label: 'Active Interviews',
      value: '--',
      caption: 'Not tracked yet',
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

      {/* Stats Grid — six cards, so 3 across makes two even rows on a desktop
          and 2 across keeps them paired on a tablet. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {stats.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            caption={stat.caption}
            icon={stat.icon}
            variant={stat.variant}
          />
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-[var(--primary)]" />
              <CardTitle>Recent Job Posts</CardTitle>
            </div>
            {jobs.length > 0 && (
              <span className="text-sm text-[var(--textSecondary)]">
                Showing {recentJobs.length} of {jobs.length}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--textSecondary)] py-8 text-center">
              No jobs posted yet. Create your first job post to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => {
                // Same day-granularity rule as the Job Events page, so a job
                // never reads Active there and Expired here.
                const isExpired = isJobExpired(job);
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
                    {/* Fixed-width slots so the badges start on one line and
                        the opening counts end on another, row after row —
                        "Active" vs "Expired" and "1" vs "100" otherwise make
                        every row sit differently. */}
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <span className="w-[68px] flex justify-start">
                        <Badge variant={isExpired ? 'error' : 'success'} size="sm">
                          {isExpired ? 'Expired' : 'Active'}
                        </Badge>
                      </span>
                      <span className="w-[92px] text-right text-xs text-[var(--textTertiary)] tabular-nums whitespace-nowrap">
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
              // Count only live jobs — the card says "Active" — and bucket by the
              // canonical type so "Full-time" and "Full-Time" are one entry.
              const typeCounts = new Map<string, number>();
              jobs
                .filter((j) => !isJobExpired(j))
                .forEach((j) => {
                  const t = canonicalJobType(j.jobType);
                  typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
                });
              const entries = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
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
                .filter((j) => !isJobExpired(j))
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
                  {upcoming.map((job) => {
                    // Amber inside the two-day window, green while there's time.
                    const color = deadlineColor(job.applicationDeadline);
                    return (
                      <div
                        key={job.id ?? job.jobPrefix}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-[var(--text)] truncate">{job.jobTitle}</span>
                        <span className="text-right whitespace-nowrap flex-shrink-0">
                          <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                            {formatDate(job.applicationDeadline)}
                          </span>
                          <span className="block text-[10px]" style={{ color, opacity: 0.75 }}>
                            {deadlineLabel(job.applicationDeadline)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
