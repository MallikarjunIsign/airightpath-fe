import { Eye, BarChart3, Video } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getAppEmail } from '@/utils/application.utils';
import { ReferralTag } from './ReferralTag';
import { AssessmentStanding } from './AssessmentStanding';
import { InterviewStanding } from './InterviewStanding';
import type { JobApplicationDTO } from '@/types/job.types';
import type { CandidateStanding } from '@/utils/scoreboard.utils';
import type { CandidateInterviewStanding } from '@/utils/interview-standing.utils';

interface CandidateTableProps {
  candidates: JobApplicationDTO[];
  selectedEmails: Set<string>;
  onToggleEmail: (email: string) => void;
  onToggleAll: () => void;
  onView: (candidate: JobApplicationDTO) => void;
  /**
   * Opens the candidate's assessment scorecard. Omitted at stages where no exam
   * has been sat yet, and the action is then left off the row entirely rather
   * than shown leading to an empty result.
   */
  onViewResult?: (candidate: JobApplicationDTO) => void;
  /**
   * Opens the candidate's interview scorecard — a different page from the exam
   * one, so it is a different action rather than a "Result" button whose
   * destination the admin has to guess from the stage they happen to be on.
   *
   * Offered per row, and only where a round has actually been sat: an interview
   * that is booked but not yet taken has no scorecard, and a button leading to
   * an empty page is the same trap `onViewResult` already avoids.
   */
  onViewInterviewResult?: (candidate: JobApplicationDTO) => void;
  /** Maps a raw status to its display label (falls back to the raw status). */
  statusLabels: Record<string, string>;
  /**
   * What each candidate was set and how it went, keyed by lowercased email.
   *
   * Omitted at stages before an exam exists, where the column would be a row of
   * "No exam set" and nothing else.
   */
  standings?: Map<string, CandidateStanding>;
  /** The standings are still arriving, so absence isn't reported as fact. */
  standingsLoading?: boolean;
  /**
   * Where each candidate stands in their interviews, keyed by lowercased email.
   *
   * Omitted at stages before any interview could exist, where the column would
   * be a row of "No interview set" and nothing else.
   */
  interviewStandings?: Map<string, CandidateInterviewStanding>;
  /** The interviews are still arriving, so absence isn't reported as fact. */
  interviewStandingsLoading?: boolean;
}

const CHECKBOX_CLASS =
  'w-4 h-4 flex-shrink-0 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]';

/**
 * Candidate pipeline with row selection.
 *
 * Cards below `xl`, table from `xl` up — ten columns of mostly free text can't
 * be read on a phone, and bulk selection is the point of this screen, so the
 * checkbox has to stay reachable in both layouts.
 *
 * The table sizes on per-column minimums and scrolls sideways when the viewport
 * cannot hold them all. It used to be `table-fixed` on percentage widths, which
 * held the table to the viewport by crushing the columns instead: a single long
 * word in a narrow column — "EXPERIENCE" in 7% — cannot wrap, so it overflowed
 * its cell and printed on top of its neighbour. Percentages that summed past
 * 100% (they reached 103% once the Interview column arrived) made it worse.
 * Minimums cannot overlap; at worst they scroll.
 */
export function CandidateTable({
  candidates,
  selectedEmails,
  onToggleEmail,
  onToggleAll,
  onView,
  onViewResult,
  onViewInterviewResult,
  statusLabels,
  standings,
  standingsLoading,
  interviewStandings,
  interviewStandingsLoading,
}: Readonly<CandidateTableProps>) {
  const allSelected = selectedEmails.size === candidates.length && candidates.length > 0;

  /** True once a round has been sat, which is when a scorecard exists to open. */
  const hasInterviewResult = (email: string) =>
    !!interviewStandings
      ?.get(email.toLowerCase())
      ?.rounds.some((round) => round.state === 'completed');

  return (
    <>
      {/* ── Mobile / tablet: cards ─────────────────────────────────────── */}
      <div className="xl:hidden space-y-3">
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

              {/* One column on a phone: two columns of free text at 360px put
                  a role like "Backend Developer" on four lines. */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 text-sm">
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
                  <dt className="text-xs text-[var(--textTertiary)]">Source</dt>
                  <dd className="mt-0.5">
                    <ReferralTag candidate={candidate} />
                  </dd>
                </div>
              </dl>

              {standings && (
                <div className="min-w-0">
                  <p className="text-xs text-[var(--textTertiary)] mb-1">Assessment</p>
                  <AssessmentStanding
                    standing={standings.get(email.toLowerCase())}
                    loading={standingsLoading}
                  />
                </div>
              )}

              {interviewStandings && (
                <div className="min-w-0">
                  <p className="text-xs text-[var(--textTertiary)] mb-1">Interview</p>
                  <InterviewStanding
                    standing={interviewStandings.get(email.toLowerCase())}
                    loading={interviewStandingsLoading}
                  />
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onView(candidate)}
                  leftIcon={<Eye size={14} />}
                >
                  View
                </Button>
                {onViewResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewResult(candidate)}
                    leftIcon={<BarChart3 size={14} />}
                  >
                    Exam Result
                  </Button>
                )}
                {onViewInterviewResult && hasInterviewResult(email) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewInterviewResult(candidate)}
                    leftIcon={<Video size={14} />}
                  >
                    Interview Result
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop: compact table ─────────────────────────────────────── */}
      <div className="hidden xl:block">
        {/* The minimum is what the columns actually need. Below it the wrapper
            scrolls, which is the honest outcome — the alternative was squeezing
            columns until their contents printed over each other. */}
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-11 px-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all candidates"
                  className={CHECKBOX_CLASS}
                />
              </TableHead>
              {/* Name, email and phone in one column, as the card layout has
                  always grouped them — they are all "who is this person", and
                  as separate columns they were three of the ten that pushed the
                  table past the viewport. */}
              <TableHead className="px-3 min-w-[210px]">Candidate</TableHead>
              {/* Role and experience together: "Experience" is one unbreakable
                  word, and in a column narrow enough to fit it overflowed into
                  the next heading — which is the "EXPERIENCFOLE" collision. */}
              <TableHead className="px-3 min-w-[130px]">Role</TableHead>
              <TableHead className="px-3 min-w-[95px]">Source</TableHead>
              {standings && <TableHead className="px-3 min-w-[180px]">Assessment</TableHead>}
              {interviewStandings && (
                <TableHead className="px-3 min-w-[175px]">Interview</TableHead>
              )}
              <TableHead className="px-3 min-w-[100px]">Status</TableHead>
              <TableHead className="px-3 min-w-[120px]">Actions</TableHead>
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

                  <TableCell className="px-3 py-3 align-top">
                    <p className="font-medium text-[var(--text)] break-words">
                      {candidate.firstName} {candidate.lastName}
                    </p>
                    <p className="text-xs text-[var(--textSecondary)] break-all" title={email}>
                      {email}
                    </p>
                    {candidate.mobileNumber && (
                      <p className="text-xs text-[var(--textTertiary)] break-words">
                        {candidate.mobileNumber}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top break-words">
                    <p className="text-[var(--text)]">{candidate.jobRole || '-'}</p>
                    {candidate.experience && (
                      <p className="text-xs text-[var(--textSecondary)]">
                        {candidate.experience} yrs exp.
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <ReferralTag candidate={candidate} />
                  </TableCell>

                  {standings && (
                    <TableCell className="px-3 py-3 align-top">
                      <AssessmentStanding
                        standing={standings.get(email.toLowerCase())}
                        loading={standingsLoading}
                      />
                    </TableCell>
                  )}

                  {interviewStandings && (
                    <TableCell className="px-3 py-3 align-top">
                      <InterviewStanding
                        standing={interviewStandings.get(email.toLowerCase())}
                        loading={interviewStandingsLoading}
                      />
                    </TableCell>
                  )}

                  <TableCell className="px-3 py-3 align-top whitespace-nowrap">
                    <Badge variant="info" size="sm">
                      {statusLabels[candidate.status] ?? candidate.status}
                    </Badge>
                  </TableCell>

                  <TableCell className="px-3 py-3 align-top whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() => onView(candidate)}
                        leftIcon={<Eye size={14} />}
                      >
                        View
                      </Button>
                      {onViewResult && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          title="Open this candidate's assessment scorecard"
                          onClick={() => onViewResult(candidate)}
                          leftIcon={<BarChart3 size={14} />}
                        >
                          Exam
                        </Button>
                      )}
                      {onViewInterviewResult && hasInterviewResult(email) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          title="Open this candidate's interview scorecard"
                          onClick={() => onViewInterviewResult(candidate)}
                          leftIcon={<Video size={14} />}
                        >
                          Interview
                        </Button>
                      )}
                    </div>
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
