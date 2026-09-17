import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { promptService } from '@/services/prompt.service';
import { ROUTES } from '@/config/routes';
import { INTERVIEW_ROUND_LABELS } from '@/types/interview.types';
import type { InterviewRound, PromptRecord } from '@/types/interview.types';

/**
 * Prompt types, spelled as the server stores them.
 *
 * Stage matters as much as type: the interviewer is looked up as
 * `(jobPrefix, type, START)`, so a prompt saved without the stage would be
 * stored and never found.
 */
const ROUND_PROMPT_TYPE: Record<InterviewRound, string> = {
  L2_TECHNICAL: 'INTERVIEW_L2_TECHNICAL',
  L3_BEHAVIORAL: 'INTERVIEW_L3_BEHAVIORAL',
};
const SHARED_PROMPT_TYPE = 'INTERVIEW';
const START_STAGE = 'START';

/** Where the prompt an interview would actually use comes from. */
type Source = 'round' | 'shared' | 'none';

/**
 * The prompt a round will interview with, shown where the round is booked.
 *
 * <p>Booking and prompt configuration live on different screens, so an
 * interview could be scheduled for a job with no interview prompt at all. That
 * used to be survivable — a prompt compiled into the backend answered instead.
 * It is not survivable now: with no prompt the candidate reaches the start
 * screen and is refused, and the first person to find out is them.</p>
 *
 * <p>So this states which prompt is in effect before anything is booked, and
 * allows a correction on the spot. The full editor still owns placeholders and
 * evaluation categories — this is the booking-time check, not a second copy of
 * that screen.</p>
 */
export function InterviewPromptPanel({
  jobPrefix,
  round,
  onConfiguredChange,
}: Readonly<{
  jobPrefix: string;
  round: InterviewRound;
  /** Lets the page warn, or block, when nothing is configured. */
  onConfiguredChange?: (configured: boolean) => void;
}>) {
  const { showToast } = useToast();

  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!jobPrefix) return;
    setLoading(true);
    try {
      // Silent: a job with no prompts yet is the case this panel exists to
      // report, not an error to toast.
      const res = await promptService.getByJob(jobPrefix, { silent: true });
      setPrompts(res.data ?? []);
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  }, [jobPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Resolved exactly as the server resolves it: the round's own prompt, else
   * the shared one. Anything else here would report a prompt the interview
   * would not actually use.
   */
  const resolved = useMemo(() => {
    const find = (type: string) =>
      prompts.find((p) => p.promptType === type && p.promptStage === START_STAGE);

    const roundPrompt = find(ROUND_PROMPT_TYPE[round]);
    if (roundPrompt) return { source: 'round' as Source, record: roundPrompt };

    const shared = find(SHARED_PROMPT_TYPE);
    if (shared) return { source: 'shared' as Source, record: shared };

    return { source: 'none' as Source, record: undefined };
  }, [prompts, round]);

  useEffect(() => {
    onConfiguredChange?.(resolved.source !== 'none');
  }, [resolved.source, onConfiguredChange]);

  // Reset the draft whenever the effective prompt changes, so switching round
  // cannot save one round's text over another's.
  useEffect(() => {
    setDraft(resolved.record?.prompt ?? '');
    setExpanded(false);
  }, [resolved.record?.id, resolved.record?.prompt]);

  const roundLabel = INTERVIEW_ROUND_LABELS[round];

  async function handleSave() {
    if (!draft.trim()) {
      showToast('The prompt cannot be empty.', 'warning');
      return;
    }
    setSaving(true);
    try {
      // Always written as this round's own prompt. Saving over the shared one
      // would quietly change the other round too, which is not what someone
      // editing from a round-specific screen is asking for.
      await promptService.save(
        {
          jobPrefix,
          promptType: ROUND_PROMPT_TYPE[round],
          promptStage: START_STAGE,
          prompt: draft,
        },
        { silent: true },
      );
      showToast(`${roundLabel} prompt saved for ${jobPrefix}.`, 'success');
      await load();
    } catch {
      showToast('The prompt could not be saved. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!jobPrefix) return null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        resolved.source === 'none'
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
          : 'border-[var(--border)] bg-[var(--surface1)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {loading ? (
            <Loader2 size={16} className="mt-0.5 animate-spin text-[var(--textTertiary)]" />
          ) : resolved.source === 'none' ? (
            <AlertTriangle
              size={16}
              className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
            />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-[var(--success)]" />
          )}
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${
                resolved.source === 'none'
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-[var(--text)]'
              }`}
            >
              {loading ? 'Checking the interview prompt…' : headline(resolved.source, roundLabel)}
            </p>
            {!loading && (
              <p
                className={`mt-0.5 text-xs ${
                  resolved.source === 'none'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-[var(--textSecondary)]'
                }`}
              >
                {detail(resolved.source, roundLabel)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {!loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((open) => !open)}
              rightIcon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            >
              {expanded ? 'Hide' : resolved.source === 'none' ? 'Add prompt' : 'View or edit'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ExternalLink size={14} />}
            onClick={() => window.open(ROUTES.ADMIN.PROMPTS, '_blank')}
            title="Placeholders and evaluation categories live in the full editor"
          >
            Full editor
          </Button>
        </div>
      </div>

      {expanded && !loading && (
        <div className="mt-4 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={`Enter the ${roundLabel} system prompt for ${jobPrefix}…`}
            className="w-full rounded-lg border border-[var(--inputBorder,var(--border))] bg-[var(--inputBg,var(--cardBg))] p-3 font-mono text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--inputFocus,var(--primary))]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--textTertiary)]">
              {resolved.source === 'shared'
                ? `Saving stores this as a ${roundLabel} prompt for this job. The shared prompt is left as it is, so the other round keeps using it.`
                : `Saved as the ${roundLabel} prompt for ${jobPrefix}.`}
            </p>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !draft.trim() || draft === (resolved.record?.prompt ?? '')}
              leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}
            >
              {saving ? 'Saving…' : `Save ${roundLabel} prompt`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function headline(source: Source, roundLabel: string): string {
  switch (source) {
    case 'round':
      return `${roundLabel} prompt is configured`;
    case 'shared':
      return 'Using the shared Interview prompt';
    default:
      return 'No interview prompt is configured for this job';
  }
}

function detail(source: Source, roundLabel: string): string {
  switch (source) {
    case 'round':
      return 'This round has its own prompt, which is what the interviewer will use.';
    case 'shared':
      return `${roundLabel} has no prompt of its own, so it falls back to the shared Interview prompt.`;
    default:
      return 'Candidates will not be able to start this interview until a prompt is added.';
  }
}
