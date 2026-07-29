import { ArrowUpDown, FileText, CheckCircle, XCircle, Eye } from 'lucide-react';
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
  onSort: (field: AtsSortField) => void;
  onView: (candidate: JobApplicationDTO) => void;
}

function SortableHead({
  label,
  field,
  activeField,
  onSort,
}: Readonly<{ label: string; field: AtsSortField; activeField: AtsSortField; onSort: (f: AtsSortField) => void }>) {
  return (
    <TableHead>
      <button
        className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        <ArrowUpDown size={14} className={activeField === field ? 'text-[var(--primary)]' : ''} />
      </button>
    </TableHead>
  );
}

/** Presentational ATS screening results table (rank, score bar, scan/shortlist status). */
export function AtsResultsTable({
  candidates,
  sortField,
  onSort,
  onView,
}: Readonly<AtsResultsTableProps>) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <SortableHead label="Name" field="firstName" activeField={sortField} onSort={onSort} />
            <TableHead>Email</TableHead>
            <SortableHead label="Experience" field="experience" activeField={sortField} onSort={onSort} />
            <TableHead>Role</TableHead>
            <TableHead>Resume</TableHead>
            <SortableHead label="ATS Score" field="matchPercent" activeField={sortField} onSort={onSort} />
            <TableHead>Scan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate, idx) => {
            const score = candidate.matchPercent ?? 0;
            // Prefer the genuine shortlistStatus column; fall back to status.
            const isShortlisted = candidate.shortlistStatus
              ? !/not/i.test(candidate.shortlistStatus)
              : candidate.status === 'SHORTLISTED';
            const shortlistLabel =
              candidate.shortlistStatus ?? (isShortlisted ? 'Shortlisted' : 'Rejected');
            const scanDone = candidate.atsScanStatus
              ? /complet/i.test(candidate.atsScanStatus)
              : undefined;

            return (
              <TableRow key={candidate.id ?? getAppEmail(candidate)}>
                <TableCell>
                  <span className="text-sm font-bold text-[var(--text)]">#{idx + 1}</span>
                </TableCell>
                <TableCell className="font-medium">
                  {candidate.firstName} {candidate.lastName}
                </TableCell>
                <TableCell className="text-sm">{getAppEmail(candidate)}</TableCell>
                <TableCell>{candidate.experience}</TableCell>
                <TableCell>{candidate.jobRole || '-'}</TableCell>
                <TableCell>
                  {candidate.resumeFileName ? (
                    <span className="flex items-center gap-1 text-sm text-[var(--textSecondary)]">
                      <FileText size={14} />
                      <span className="truncate max-w-[120px]">{candidate.resumeFileName}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--textTertiary)]">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getScoreBg(score)}`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                      {score.toFixed(1)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {candidate.atsScanStatus ? (
                    <Badge variant={scanDone ? 'info' : 'warning'} size="sm">
                      {candidate.atsScanStatus}
                    </Badge>
                  ) : (
                    <span className="text-sm text-[var(--textTertiary)]">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={isShortlisted ? 'success' : 'error'} size="sm">
                    <span className="flex items-center gap-1">
                      {isShortlisted ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {shortlistLabel}
                    </span>
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => onView(candidate)} leftIcon={<Eye size={14} />}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
