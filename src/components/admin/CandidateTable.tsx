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

/** Presentational candidate pipeline table with row selection. */
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Referral</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => {
            const email = getAppEmail(candidate);
            return (
              <TableRow key={candidate.id ?? email}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email)}
                    onChange={() => onToggleEmail(email)}
                    className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {candidate.firstName} {candidate.lastName}
                </TableCell>
                <TableCell>{email}</TableCell>
                <TableCell>{candidate.mobileNumber || '-'}</TableCell>
                <TableCell>{candidate.experience}</TableCell>
                <TableCell>{candidate.jobRole || '-'}</TableCell>
                <TableCell>{referralDisplay(candidate.referralName, candidate.referralId)}</TableCell>
                <TableCell>
                  <Badge variant="info" size="sm">
                    {statusLabels[candidate.status] ?? candidate.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
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
  );
}
