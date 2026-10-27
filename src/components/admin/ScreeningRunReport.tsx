import { CheckCircle, XCircle, MinusCircle, HelpCircle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ScreeningRun } from '@/types/job.types';

/**
 * What the last screening run did, per candidate.
 *
 * Screening skips anyone past the shortlist stage, anyone shortlisted without
 * ATS (a referral), and anyone with a finalised rejection. Those rows are still
 * scored but not saved — without saying so, the admin sees a candidate that
 * "didn't move" and has no idea why. The backend writes each `reason` to be
 * shown as-is, so it is rendered verbatim.
 */
export function ScreeningRunReport({
  run,
  onDismiss,
}: Readonly<{ run: ScreeningRun; onDismiss: () => void }>) {
  const skipped = run.results?.filter((r) => !r.screened && r.status !== null) ?? [];
  const notFound = run.results?.filter((r) => !r.screened && r.status === null) ?? [];

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[var(--text)]">
                Screening run{run.scope === 'SELECTED' ? ' — selected candidates' : ' — all applicants'}
              </h3>
              {run.message && (
                <p className="text-sm text-[var(--textSecondary)] mt-0.5">{run.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss run report"
              className="p-1 rounded-lg text-[var(--textTertiary)] hover:text-[var(--text)] hover:bg-[var(--bgSubtle,var(--surface1))] transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Counts */}
          <div className="flex flex-wrap gap-2">
            <Stat icon={<CheckCircle size={13} />} variant="success" label="Screened" value={run.screenedCount} />
            <Stat icon={<CheckCircle size={13} />} variant="primary" label="Shortlisted" value={run.shortlistedCount} />
            <Stat icon={<XCircle size={13} />} variant="error" label="Rejected" value={run.rejectedCount} />
            {run.skippedCount > 0 && (
              <Stat icon={<MinusCircle size={13} />} variant="warning" label="Skipped" value={run.skippedCount} />
            )}
            {run.notFoundCount > 0 && (
              <Stat icon={<HelpCircle size={13} />} variant="secondary" label="Not found" value={run.notFoundCount} />
            )}
            {run.threshold !== undefined && (
              <Badge variant="secondary" size="sm">Shortlist cut-off {run.threshold}%</Badge>
            )}
          </div>

          {/* Skipped — scored, but deliberately not saved */}
          {skipped.length > 0 && (
            <div className="rounded-xl border border-[var(--borderMuted,var(--border))] overflow-hidden">
              <p className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--textTertiary)] bg-[var(--bgSubtle,var(--surface1))]">
                Not changed ({skipped.length})
              </p>
              <ul className="divide-y divide-[var(--borderMuted,var(--border))]/60">
                {skipped.map((row) => (
                  <li key={row.email} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                    <div className="min-w-0 sm:w-64 flex-shrink-0">
                      <p className="text-sm font-medium text-[var(--text)] break-words">
                        {row.fullName || row.email}
                      </p>
                      <p className="text-xs text-[var(--textSecondary)] break-all">{row.email}</p>
                    </div>
                    <p className="text-sm text-[var(--textSecondary)] flex-1 min-w-0">{row.reason}</p>
                    {row.matchPercent !== undefined && (
                      <span className="text-xs text-[var(--textTertiary)] tabular-nums whitespace-nowrap">
                        would score {row.matchPercent.toFixed(1)}%
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No application on this job for those addresses */}
          {notFound.length > 0 && (
            <div className="rounded-xl border border-[var(--warning)] px-4 py-3">
              <p className="text-sm text-[var(--warning)] font-medium">
                No application on this job for {notFound.length} address
                {notFound.length === 1 ? '' : 'es'}
              </p>
              <p className="text-xs text-[var(--textSecondary)] mt-1 break-all">
                {notFound.map((r) => r.email).join(', ')}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  variant,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: number;
  variant: 'success' | 'error' | 'warning' | 'primary' | 'secondary';
}>) {
  return (
    <Badge variant={variant} size="md">
      <span className="flex items-center gap-1.5">
        {icon}
        {label}: <strong className="tabular-nums">{value}</strong>
      </span>
    </Badge>
  );
}
