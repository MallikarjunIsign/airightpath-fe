import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { interviewService } from '@/services/interview.service';
import { useRbac } from '@/hooks/useRbac';
import { PERMISSIONS } from '@/config/permissions';
import { extractApiError } from '@/services/api.service';
import { formatServerDateTime } from '@/utils/format.utils';
import type { InterviewSchedule } from '@/types/interview.types';

/**
 * Reasons offered as one click, because the three that come up constantly are
 * the three nobody bothers to type.
 *
 * <p>Not a closed list. "Other" leaves the box empty and the admin writes what
 * actually happened, which is the case that most needs recording.</p>
 */
const COMMON_REASONS = [
  'Duplicate — the candidate sat this round twice',
  'Test run, not a real candidate',
  'Candidate withdrew from the process',
  'Technical failure — the interview has to be re-run',
];

const MIN_REASON_LENGTH = 10;

/**
 * Takes an interview result off the results list, with a reason on the record.
 *
 * <p>Removal is soft all the way down: the server keeps the row, the
 * transcript, the proctoring events, the recordings and the evaluation, and
 * stamps it with who removed it, when and why. Nothing here destroys evidence
 * behind a hiring decision — it tidies a screen, and says who tidied it.</p>
 *
 * <p>The reason is required and has a floor on its length. "x" satisfies a
 * required field and tells the next person nothing, which is the state this is
 * meant to prevent.</p>
 */
export function InterviewResultRemoveButton({
  interview,
  onRemoved,
  variant = 'ghost',
}: Readonly<{
  interview: InterviewSchedule;
  onRemoved: (updated: InterviewSchedule) => void;
  variant?: 'ghost' | 'outline';
}>) {
  const { showToast } = useToast();
  const { hasPermission } = useRbac();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Hidden rather than disabled where the permission is absent. The server
  // enforces it either way; a greyed-out Remove on every row only tells the
  // reviewer about something they cannot do.
  const allowed = hasPermission(PERMISSIONS.INTERVIEW_RESULT_DELETE);

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_REASON_LENGTH;
  const canSubmit = trimmed.length >= MIN_REASON_LENGTH && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await interviewService.deleteResult(interview.id, trimmed);
      onRemoved(res.data);
      showToast('Result removed. It can be restored from "Show removed".', 'success');
      setOpen(false);
      setReason('');
    } catch (err) {
      const api = extractApiError(err);
      showToast(api.serverMessage || api.message || 'The result could not be removed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="px-2 text-[var(--error,#dc2626)] hover:bg-red-50 dark:hover:bg-red-900/20"
        leftIcon={<Trash2 size={14} />}
        onClick={() => setOpen(true)}
        title="Remove this result from the list"
      >
        Remove
      </Button>

      <Modal
        isOpen={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        title="Remove this interview result"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="min-w-0 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Nothing is deleted.</p>
              <p className="mt-1 leading-snug">
                The transcript, proctoring events, recordings and evaluation are all kept. The
                result drops off this list and off the summary figures, and your name, the time
                and your reason are recorded against it.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-[var(--textTertiary)]">Candidate</dt>
            <dd className="break-all font-medium text-[var(--text)]">{interview.email}</dd>
            <dt className="text-[var(--textTertiary)]">Job</dt>
            <dd className="break-all text-[var(--text)]">{interview.jobPrefix}</dd>
            <dt className="text-[var(--textTertiary)]">Round</dt>
            <dd className="text-[var(--text)]">{interview.roundLabel ?? interview.round ?? '--'}</dd>
            <dt className="text-[var(--textTertiary)]">Result</dt>
            <dd className="text-[var(--text)]">{interview.interviewResult}</dd>
          </dl>

          <div>
            <label
              htmlFor="interview-removal-reason"
              className="mb-1 block text-sm font-medium text-[var(--text)]"
            >
              Why is it being removed? <span className="text-[var(--error,#dc2626)]">*</span>
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {COMMON_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--textSecondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              id="interview-removal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="This is read by whoever asks later why the result is not there."
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface1)] p-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
            {tooShort && (
              <p className="mt-1 text-xs text-[var(--error,#dc2626)]">
                Give at least {MIN_REASON_LENGTH} characters — enough to be read as a reason.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!canSubmit}
              leftIcon={
                saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />
              }
            >
              Remove result
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Puts a removed result back on the list. */
export function InterviewResultRestoreButton({
  interview,
  onRestored,
}: Readonly<{
  interview: InterviewSchedule;
  onRestored: (updated: InterviewSchedule) => void;
}>) {
  const { showToast } = useToast();
  const { hasPermission } = useRbac();
  const [saving, setSaving] = useState(false);

  async function restore() {
    setSaving(true);
    try {
      const res = await interviewService.restoreResult(interview.id);
      onRestored(res.data);
      showToast('Result restored to the list.', 'success');
    } catch (err) {
      const api = extractApiError(err);
      showToast(api.serverMessage || api.message || 'The result could not be restored.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission(PERMISSIONS.INTERVIEW_RESULT_DELETE)) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2"
      leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
      onClick={restore}
      disabled={saving}
      title="Put this result back on the list"
    >
      Restore
    </Button>
  );
}

/**
 * The removal audit, wherever a removed result is shown.
 *
 * <p>Renders nothing for a result that still stands, so callers can drop it in
 * without a condition of their own. A row marked "removed" and nothing else is
 * the state this exists to replace: the reason is the whole point of recording
 * one.</p>
 */
export function InterviewRemovalNotice({
  interview,
  className = '',
}: Readonly<{ interview: InterviewSchedule; className?: string }>) {
  if (!interview.deletedAt) return null;

  return (
    <div
      className={`rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800/60 dark:bg-red-900/20 ${className}`}
    >
      <div className="flex items-start gap-2">
        <Trash2 size={14} className="mt-0.5 shrink-0 text-red-500" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-red-800 dark:text-red-200">
            Removed from the results list
          </p>
          <p className="mt-1 break-words text-red-700 dark:text-red-300">
            {interview.deleteReason || 'No reason was recorded.'}
          </p>
          <p className="mt-1 text-xs text-red-600/90 dark:text-red-400/90">
            By {interview.deletedBy || 'unknown'} on {formatServerDateTime(interview.deletedAt)}.
            The transcript, recordings and evaluation are all still here.
          </p>
        </div>
      </div>
    </div>
  );
}
