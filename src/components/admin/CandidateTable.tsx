import { Eye } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getAppEmail } from '@/utils/application.utils';
import { referralDisplay } from '@/utils/referral.utils';
import type { JobApplicationDTO } from '@/types/job.types';

interface CandidateTableProps {
  candidates: JobApplicationDTO[];
  selectedEmails: Set<string>;
  onToggleEmail: (email: string) => void;
  onToggleAll: () => void;
  onView: (candidate: JobApplicationDTO) => void;
  /** Maps a raw status to its display label (falls back to the raw status). */
  statusLabels: Record<string, string>;
}

const CHECKBOX_CLASS =
  'w-4 h-4 flex-shrink-0 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]';

/**
 * Candidate pipeline with row selection.
 *
 * Cards below `lg`, table from `lg` up — nine columns of mostly free text can't
 * be read on a phone, and bulk selection is the point of this screen, so the
 * checkbox has to stay reachable in both layouts.
 */
export function CandidateTable({
  candidates,
  selectedEmails,
  onToggleEmail,
  onToggleAll,
  onView,
  statusLabels,
}: Readonly<CandidateTableProps>) {
  const allSelected = selectedEmails.size === candidates.length && candidates.length > 0;

  return (
    <>
      {/* ── Mobile / tablet: cards ─────────────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--textSecondary)] px-1">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className={CHECKBOX_CLASS}
          />
          Select all ({candidates.length})
        </label>

        {candidates.map((candidate) => {
          const email = getAppEmail(candidate);
          const selected = selectedEmails.has(email);

          return (
            <div
              key={candidate.id ?? email}
              className={`rounded-2xl border bg-[var(--cardBg)] p-4 space-y-3 transition-colors ${
                selected
                  ? 'border-[var(--primary)]'
                  : 'border-[var(--borderMuted,var(--border))]'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleEmail(email)}
                  aria-label={`Select ${email}`}
                  className={`${CHECKBOX_CLASS} mt-1`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--text)] break-words">
                    {candidate.firstName} {candidate.lastName}
                  </p>
                  <p className="text-sm text-[var(--textSecondary)] break-all">{email}</p>
                </div>
                <Badge variant="info" size="sm" className="flex-shrink-0">
                  {statusLabels[candidate.status] ?? candidate.status}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Mobile</dt>
                  <dd className="text-[var(--text)] break-words">
                    {candidate.mobileNumber || '-'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Experience</dt>
                  <dd className="text-[var(--text)] break-words">{candidate.experience || '-'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Role</dt>
                  <dd className="text-[var(--text)] break-words">{candidate.jobRole || '-'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--textTertiary)]">Referral</dt>
                  <dd className="text-[var(--text)] break-words">
                    {referralDisplay(candidate.referralName, candidate.referralId)}
                  </dd>
                </div>
              </dl>

              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
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
              <TableHead className="w-10 px-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all candidates"
                  className={CHECKBOX_CLASS}
                />
              </TableHead>
              <TableHead className="px-3 w-[26%]">Candidate</TableHead>
              <TableHead className="px-3 w-[13%]">Mobile</TableHead>
              <TableHead className="px-3 w-[11%]">Experience</TableHead>
              <TableHead className="px-3 w-[14%]">Role</TableHead>
              <TableHead className="px-3 w-[14%]">Referral</TableHead>
              <TableHead className="px-3 w-[13%]">Status</TableHead>
              <TableHead className="px-3 w-[8%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => {
              const email = getAppEmail(candidate);
              return (
                <TableRow key={candidate.id ?? email}>
                  <TableCell className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(email)}
                      onChange={() => onToggleEmail(email)}
                      aria-label={`Select ${email}`}
                      className={CHECKBOX_CLASS}
                    />
                  </TableCell>

                  {/* Name and email share a column — two columns of long free
                      text were what forced the table off screen. */}
                  <TableCell className="px-3 py-3 align-top">
                    <p className="font-medium text-[var(--text)] break-words">
                      {candidate.firstName} {candidate.lastName}
                    </p>
                    <p className="text-xs text-[var(--textSecondary)] break-all" title={email}>
                      {email}
                    </p>
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top break-words">
                    {candidate.mobileNumber || '-'}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top break-words">
                    {candidate.experience || '-'}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top break-words">
                    {candidate.jobRole || '-'}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top break-words">
                    {referralDisplay(candidate.referralName, candidate.referralId)}
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top">
                    <Badge variant="info" size="sm">
                      {statusLabels[candidate.status] ?? candidate.status}
                    </Badge>
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
