import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { interviewService } from '@/services/interview.service';
import { formatServerDateTime } from '@/utils/format.utils';
import type { InterviewResult, InterviewReviewDTO } from '@/types/interview.types';

/** "Keep" is first and is the default — an override should be a deliberate act. */
const DECISION_OPTIONS = [
  { value: '', label: 'Keep the AI result' },
  { value: 'PASSED', label: 'Override — Passed' },
  { value: 'FAILED', label: 'Override — Failed' },
];

interface Props {
  scheduleId: number;
  /** What the AI concluded, shown so a reviewer knows what they are changing. */
  aiResult?: InterviewResult;
  /** Why this interview was flagged, if it was. Empty when it was not. */
  reviewReasons?: string[];
  /** Called after a save, so the page can re-read the result that now stands. */
  onSaved?: () => void;
}

/**
 * A person's verdict on a finished interview: notes, and an override if they
 * are overturning the machine.
 *
 * <p>Saving here changes the interview's recorded outcome and nothing else. It
 * does not move the candidate through the pipeline or send them anything —
 * those stay explicit actions elsewhere, because an override that quietly
 * rejected somebody would be a great deal of consequence for a form with a
 * notes box on it. The panel says so rather than leaving it to be discovered.</p>
 */
export function InterviewReviewPanel({ scheduleId, aiResult, reviewReasons, onSaved }: Readonly<Props>) {
  const { showToast } = useToast();

  const [review, setReview] = useState<InterviewReviewDTO | null>(null);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const existing = await interviewService.getReview(scheduleId, { silent: true });
      setReview(existing);
      setNotes(existing?.notes ?? '');
      setDecision(existing?.overriddenResult ?? '');
      setReason(existing?.overrideReason ?? '');
    } catch {
      // A review that cannot be read is not a reason to hide the form — the
      // reviewer can still write one, and saving will overwrite whatever is
      // there.
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (decision && !reason.trim()) {
      showToast('Changing the result needs a reason.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { data } = await interviewService.saveReview(scheduleId, {
        notes: notes.trim() || undefined,
        overriddenResult: (decision || null) as InterviewResult | null,
        overrideReason: decision ? reason.trim() : undefined,
      });
      setReview(data);
      showToast(decision ? 'Result overridden.' : 'Review saved.', 'success');
      onSaved?.();
    } catch {
      showToast('Could not save this review.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const flagged = (reviewReasons?.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Reviewer decision</CardTitle>
          {review?.overriddenResult && (
            <Badge variant={review.overriddenResult === 'PASSED' ? 'success' : 'error'} size="sm">
              Overridden to {review.overriddenResult.toLowerCase()}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Why this one was flagged. Stated before the form, because it is
                the reason the reviewer is here and it should shape what they
                look for in the transcript. */}
            {flagged && (
              <div className="rounded-lg border border-[var(--warning,orange)]/40 bg-[var(--warning,orange)]/10 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <ShieldQuestion size={15} className="text-[var(--warning,orange)]" />
                  <span className="text-sm font-semibold text-[var(--text)]">
                    Flagged for a person to look at
                  </span>
                </div>
                <ul className="space-y-1">
                  {reviewReasons?.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-[var(--textSecondary)]">
                      <span className="flex-shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review?.reviewerEmail && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--textTertiary)]">
                <CheckCircle2 size={13} className="text-[var(--success)]" />
                Last reviewed by {review.reviewerEmail}
                {review.reviewedAt ? ` on ${formatServerDateTime(review.reviewedAt)}` : ''}
              </p>
            )}

            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What you made of this interview. Visible to anyone who can see the result."
              helperText="Worth writing even when you agree — it tells the next person this has been looked at."
            />

            <Select
              label="Final result"
              options={DECISION_OPTIONS}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              helperText={
                aiResult
                  ? `The AI concluded: ${aiResult.toLowerCase()}.`
                  : 'This interview has no AI result yet.'
              }
            />

            {decision && (
              <Textarea
                label="Reason for the change"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why the AI's result is wrong for this candidate."
                helperText="Required. This is the record of why a hiring outcome was changed after the fact."
              />
            )}

            <p className="text-xs text-[var(--textTertiary)]">
              Saving records the decision against this interview. It does not move the candidate to
              the next stage or notify them — those remain separate actions.
            </p>

            <div className="flex justify-end border-t border-[var(--border)] pt-3">
              <Button onClick={save} isLoading={saving} disabled={saving}>
                {decision ? 'Save and override' : 'Save review'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
