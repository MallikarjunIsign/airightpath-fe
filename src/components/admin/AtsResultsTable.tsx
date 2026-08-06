import { ArrowUpDown, ArrowUp, ArrowDown, FileText, CheckCircle, XCircle, Eye } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getAppEmail } from '@/utils/application.utils';
import { getScoreColor, getScoreBg } from '@/utils/score.utils';
import type { JobApplicationDTO } from '@/types/job.types';

export type AtsSortField = 'matchPercent' | 'firstName' | 'experience';

interface AtsResultsTableProps {
  candidates: JobApplicationDTO[];
  sortField: AtsSortField;
  /** Only used to draw the direction arrow; sorting itself stays with the page. */
  sortDirection?: 'asc' | 'desc';
  onSort: (field: AtsSortField) => void;
  onView: (candidate: JobApplicationDTO) => void;
}

const SORT_OPTIONS: { field: AtsSortField; label: string }[] = [
  { field: 'matchPercent', label: 'Score' },
  { field: 'firstName', label: 'Name' },
  { field: 'experience', label: 'Experience' },
];

/** The three derived flags every row/card needs. */
function readCandidate(candidate: JobApplicationDTO) {
  // Prefer the genuine shortlistStatus column; fall back to status.
  const isShortlisted = candidate.shortlistStatus
    ? !/not/i.test(candidate.shortlistStatus)
    : candidate.status === 'SHORTLISTED';
  return {
    score: candidate.matchPercent ?? 0,
    isShortlisted,
    shortlistLabel: candidate.shortlistStatus ?? (isShortlisted ? 'Shortlisted' : 'Rejected'),
    scanDone: candidate.atsScanStatus ? /complet/i.test(candidate.atsScanStatus) : undefined,
  };
}

function SortArrow({ active, direction }: Readonly<{ active: boolean; direction?: 'asc' | 'desc' }>) {
  if (!active) return <ArrowUpDown size={14} />;
  if (direction === 'asc') return <ArrowUp size={14} className="text-[var(--primary)]" />;
  return <ArrowDown size={14} className="text-[var(--primary)]" />;
}

function SortableHead({
  label,
  field,
  activeField,
  direction,
  onSort,
  className,
}: Readonly<{
  label: string;
  field: AtsSortField;
  activeField: AtsSortField;
  direction?: 'asc' | 'desc';
  onSort: (f: AtsSortField) => void;
  className?: string;
}>) {
  return (
    <TableHead className={className}>
      <button
        className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        <SortArrow active={activeField === field} direction={direction} />
      </button>
    </TableHead>
  );
}

/** Score bar + percentage, shared by the table row and the mobile card. */
function ScoreMeter({ score, className = '' }: Readonly<{ score: number; className?: string }>) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 min-w-0 h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className={`h-full rounded-full ${getScoreBg(score)}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${getScoreColor(score)}`}>
        {score.toFixed(1)}%
      </span>
    </div>
  );
}

function ShortlistBadge({
  isShortlisted,
  label,
}: Readonly<{ isShortlisted: boolean; label: string }>) {
  return (
    <Badge variant={isShortlisted ? 'success' : 'error'} size="sm">
      <span className="flex items-center gap-1">
        {isShortlisted ? <CheckCircle size={12} /> : <XCircle size={12} />}
        {label}
      </span>
    </Badge>
  );
}

/**
 * ATS screening results.
 *
 * Below `lg` this renders one card per candidate — ten columns cannot be read
 * on a phone, and a horizontally scrolling table hides the score, which is the
 * whole point of the screen. From `lg` up it is a table, tightened so it fits a
 * laptop without scrolling: name and email share a column, scan and shortlist
 * share a column, and the wide free-text fields wrap instead of stretching.
 */
export function AtsResultsTable({
  candidates,
  sortField,
  sortDirection,
  onSort,
  onView,
}: Readonly<AtsResultsTableProps>) {
  return (
    <>
      {/* ── Mobile / tablet: cards ─────────────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        {/* Sorting lives in the header row on desktop; on cards it needs its own control. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--textTertiary)]">
            Sort
          </span>
          {SORT_OPTIONS.map((opt) => {
            const active = sortField === opt.field;
            return (
              <button
                key={opt.field}
                type="button"
                onClick={() => onSort(opt.field)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primaryMuted,var(--primaryLight))]'
                    : 'border-[var(--border)] text-[var(--textSecondary)] hover:text-[var(--text)]'
                }`}
              >
                {opt.label}
                <SortArrow active={active} direction={sortDirection} />
              </button>
            );
          })}
        </div>

        {candidates.map((candidate, idx) => {
          const { score, isShortlisted, shortlistLabel, scanDone } = readCandidate(candidate);

          return (
            <div
              key={candidate.id ?? getAppEmail(candidate)}
              className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
            >
              {/* Rank + name + score */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-[var(--bgSubtle,var(--surface1))] flex items-center justify-center text-xs font-bold text-[var(--text)]">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--text)] break-words">
                    {candidate.firstName} {candidate.lastName}
                  </p>
                  <p className="text-sm text-[var(--textSecondary)] break-all">
                    {getAppEmail(candidate)}
                  </p>
                </div>
              </div>

              <ScoreMeter score={score} />

              {/* Facts — two per row on all but the narrowest phones */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Experience</dt>
                  <dd className="text-[var(--text)] break-words">{candidate.experience || '-'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Role</dt>
                  <dd className="text-[var(--text)] break-words">{candidate.jobRole || '-'}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Resume</dt>
                  <dd className="text-[var(--textSecondary)]">
                    {candidate.resumeFileName ? (
                      <span className="flex items-center gap-1.5 min-w-0">
                        <FileText size={14} className="flex-shrink-0" />
                        <span className="truncate" title={candidate.resumeFileName}>
                          {candidate.resumeFileName}
                        </span>
                      </span>
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>
              </dl>

              {/* Statuses + action */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {candidate.atsScanStatus && (
                  <Badge variant={scanDone ? 'info' : 'warning'} size="sm">
                    {candidate.atsScanStatus}
                  </Badge>
                )}
                <ShortlistBadge isShortlisted={isShortlisted} label={shortlistLabel} />
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => onView(candidate)}
                  leftIcon={<Eye size={14} />}
                >
                  View
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop: compact table ─────────────────────────────────────── */}
      <div className="hidden lg:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-3">#</TableHead>
              <SortableHead
                label="Candidate"
                field="firstName"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
                className="px-3 w-[24%]"
              />
              <SortableHead
                label="Experience"
                field="experience"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
                className="px-3 w-[11%]"
              />
              <TableHead className="px-3 w-[14%]">Role</TableHead>
              <TableHead className="px-3 w-[16%]">Resume</TableHead>
              <SortableHead
                label="ATS Score"
                field="matchPercent"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
                className="px-3 w-[14%]"
              />
              <TableHead className="px-3 w-[13%]">Status</TableHead>
              <TableHead className="px-3 w-[8%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate, idx) => {
              const { score, isShortlisted, shortlistLabel, scanDone } = readCandidate(candidate);

              return (
                <TableRow key={candidate.id ?? getAppEmail(candidate)}>
                  <TableCell className="px-3 py-3 align-top">
                    <span className="text-sm font-bold text-[var(--text)]">#{idx + 1}</span>
                  </TableCell>

                  {/* Name and email share a column — two narrow columns of long
                      free text were what pushed the table off screen. */}
                  <TableCell className="px-3 py-3 align-top">
                    <p className="font-medium text-[var(--text)] break-words">
                      {candidate.firstName} {candidate.lastName}
                    </p>
                    <p
                      className="text-xs text-[var(--textSecondary)] break-all"
                      title={getAppEmail(candidate)}
                    >
                      {getAppEmail(candidate)}
                    </p>
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top break-words">
                    {candidate.experience || '-'}
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top break-words">
                    {candidate.jobRole || '-'}
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top">
                    {candidate.resumeFileName ? (
                      <span className="flex items-center gap-1 text-sm text-[var(--textSecondary)] min-w-0">
                        <FileText size={14} className="flex-shrink-0" />
                        <span className="truncate" title={candidate.resumeFileName}>
                          {candidate.resumeFileName}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-[var(--textTertiary)]">-</span>
                    )}
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top">
                    <ScoreMeter score={score} />
                  </TableCell>

                  {/* Scan and shortlist stack in one column instead of two. */}
                  <TableCell className="px-3 py-3 align-top">
                    <div className="flex flex-col items-start gap-1">
                      <ShortlistBadge isShortlisted={isShortlisted} label={shortlistLabel} />
                      {candidate.atsScanStatus && (
                        <Badge variant={scanDone ? 'info' : 'warning'} size="sm">
                          {candidate.atsScanStatus}
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => onView(candidate)}
                      leftIcon={<Eye size={14} />}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
