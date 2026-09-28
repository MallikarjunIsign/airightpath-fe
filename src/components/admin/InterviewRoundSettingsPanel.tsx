import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { promptService } from '@/services/prompt.service';
import {
  INTERVIEW_DIFFICULTY_HINTS,
  INTERVIEW_DIFFICULTY_LABELS,
  INTERVIEW_ROUND_LABELS,
  type EffectiveInterviewTemplate,
  type EvaluationCategory,
  type InterviewDifficulty,
  type InterviewRound,
} from '@/types/interview.types';

const ROUNDS: InterviewRound[] = ['L2_TECHNICAL', 'L3_BEHAVIORAL'];

const DIFFICULTY_OPTIONS = (Object.keys(INTERVIEW_DIFFICULTY_LABELS) as InterviewDifficulty[]).map(
  (value) => ({ value, label: INTERVIEW_DIFFICULTY_LABELS[value] })
);

type DraftCategory = Pick<EvaluationCategory, 'categoryName' | 'weight' | 'description'>;

/**
 * Per-round interview settings: how many questions, how hard, and what the
 * round is scored on.
 *
 * <p>All of this used to be one setting for the whole platform, changed by
 * redeploying: the same ten-to-twenty question budget for a graduate screen and
 * a senior technical round, one difficulty inferred from however the recruiter
 * happened to word their prompt, and one list of scoring categories shared by
 * both rounds of a job — which is why a behavioural round came back with a
 * "Programming" score for questions it never asked.</p>
 *
 * <p>Rounds are tabs rather than two panels side by side. They are alternatives:
 * a recruiter is configuring one interview at a time, and showing both invites
 * editing the wrong one.</p>
 */
export function InterviewRoundSettingsPanel({ jobPrefix }: Readonly<{ jobPrefix: string }>) {
  const { showToast } = useToast();

  const [round, setRound] = useState<InterviewRound>('L2_TECHNICAL');
  const [template, setTemplate] = useState<EffectiveInterviewTemplate | null>(null);

  // Held as strings so a field can be emptied while typing, and because empty
  // is meaningful here: it means "use the platform default", which is how an
  // override is cleared without having to know what the default was.
  const [minQuestions, setMinQuestions] = useState('');
  const [maxQuestions, setMaxQuestions] = useState('');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('STANDARD');
  const [adaptive, setAdaptive] = useState(true);

  /** The round's own categories, or null when it is using the shared list. */
  const [override, setOverride] = useState<DraftCategory[] | null>(null);
  /** What the round is scored on today, whether overridden or not. */
  const [effective, setEffective] = useState<DraftCategory[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!jobPrefix) return;
    setLoading(true);
    try {
      const [templateRes, ownRes, effectiveRes] = await Promise.all([
        promptService.getInterviewTemplate(jobPrefix, round, { silent: true }),
        promptService.getEvaluationCategories(jobPrefix, round, { silent: true }),
        promptService.getEffectiveEvaluationCategories(jobPrefix, round, { silent: true }),
      ]);

      const resolved = templateRes.data;
      setTemplate(resolved);
      // Blank where the job has not overridden, so the placeholder can show the
      // platform's number rather than presenting it as this job's choice.
      setMinQuestions(resolved?.configured ? String(resolved.minQuestions) : '');
      setMaxQuestions(resolved?.configured ? String(resolved.maxQuestions) : '');
      setDifficulty(resolved?.baselineDifficulty ?? 'STANDARD');
      setAdaptive(resolved?.adaptiveDifficulty ?? true);

      const own = ownRes.data ?? [];
      setOverride(own.length > 0 ? own.map(toDraft) : null);
      setEffective((effectiveRes.data ?? []).map(toDraft));
    } catch {
      showToast('Could not load this round’s settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [jobPrefix, round, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const totalWeight = (override ?? effective).reduce((sum, c) => sum + (c.weight || 0), 0);

  function updateCategory(index: number, patch: Partial<DraftCategory>) {
    setOverride((prev) =>
      prev ? prev.map((cat, i) => (i === index ? { ...cat, ...patch } : cat)) : prev
    );
  }

  async function saveSettings() {
    const min = minQuestions.trim() === '' ? null : Number(minQuestions);
    const max = maxQuestions.trim() === '' ? null : Number(maxQuestions);

    // Checked here as well as on the server. The server is the authority — the
    // console is not the only way in — but a recruiter should not have to
    // submit to find out the numbers cannot both be true.
    if ((min !== null && !Number.isInteger(min)) || (max !== null && !Number.isInteger(max))) {
      showToast('Question counts must be whole numbers.', 'warning');
      return;
    }
    if (min !== null && min < 1) {
      showToast('An interview must ask at least one question.', 'warning');
      return;
    }
    const effectiveMin = min ?? template?.minQuestions ?? 0;
    const effectiveMax = max ?? template?.maxQuestions ?? 0;
    if (effectiveMax < effectiveMin) {
      showToast(
        `The ceiling (${effectiveMax}) cannot be below the floor (${effectiveMin}).`,
        'warning'
      );
      return;
    }
    if (override) {
      if (override.some((c) => !c.categoryName.trim())) {
        showToast('Every category needs a name.', 'warning');
        return;
      }
      if (totalWeight !== 100) {
        showToast(`Weights must total 100 — they currently total ${totalWeight}.`, 'warning');
        return;
      }
    }

    setSaving(true);
    try {
      await promptService.saveInterviewTemplate({
        jobPrefix,
        round,
        minQuestions: min,
        maxQuestions: max,
        baselineDifficulty: difficulty,
        adaptiveDifficulty: adaptive,
      });
      // An empty list is how an override is removed: the save replaces the
      // round's rows with nothing, and resolution falls back to the shared list.
      await promptService.saveEvaluationCategories({
        jobPrefix,
        round,
        categories: (override ?? []).map((c) => ({ ...c, jobPrefix })),
      });
      showToast(`${INTERVIEW_ROUND_LABELS[round]} settings saved.`, 'success');
      load();
    } catch {
      showToast('Could not save this round’s settings.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Interview setup by round</CardTitle>
          <div className="flex items-center gap-1 rounded-lg bg-[var(--surface1)] p-1">
            {ROUNDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRound(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  round === value
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--textSecondary)] hover:bg-[var(--surface2)]'
                }`}
              >
                {INTERVIEW_ROUND_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-[var(--textSecondary)]">
              Applies to {INTERVIEW_ROUND_LABELS[round]} interviews for this job.{' '}
              {template?.configured
                ? 'This round has its own settings.'
                : 'This round is running on the platform defaults.'}
            </p>

            {/* ── Question budget ─────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Fewest questions"
                type="number"
                min={1}
                value={minQuestions}
                placeholder={`Default: ${template?.minQuestions ?? '—'}`}
                onChange={(e) => setMinQuestions(e.target.value)}
                helperText="Before the interviewer may end it early. Leave blank for the default."
              />
              <Input
                label="Most questions"
                type="number"
                min={1}
                value={maxQuestions}
                placeholder={`Default: ${template?.maxQuestions ?? '—'}`}
                onChange={(e) => setMaxQuestions(e.target.value)}
                helperText="A hard stop. Follow-ups count towards it."
              />
            </div>

            {/* ── Difficulty ──────────────────────────────────────── */}
            <div className="space-y-3">
              <Select
                label="Starting difficulty"
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as InterviewDifficulty)}
                helperText={INTERVIEW_DIFFICULTY_HINTS[difficulty]}
              />
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adaptive}
                  onChange={(e) => setAdaptive(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                />
                <span className="text-sm">
                  <span className="font-medium text-[var(--text)]">
                    Adjust difficulty as the interview goes
                  </span>
                  <span className="block text-[var(--textSecondary)]">
                    Questions get harder or easier with how the candidate is answering. Turn this
                    off to ask every candidate at the same level — scores are then comparable
                    across a cohort.
                  </span>
                </span>
              </label>
            </div>

            {/* ── Scoring categories ──────────────────────────────── */}
            <div className="space-y-3 border-t border-[var(--border)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text)]">
                    Scoring categories for this round
                  </h4>
                  <p className="text-xs text-[var(--textSecondary)]">
                    Also the topic list — the interviewer is held open until the heavier ones have
                    been asked about.
                  </p>
                </div>
                {override ? (
                  <span
                    className={`text-xs font-semibold ${
                      totalWeight === 100 ? 'text-[var(--success)]' : 'text-[var(--warning,orange)]'
                    }`}
                  >
                    Total: {totalWeight}%
                  </span>
                ) : null}
              </div>

              {override === null ? (
                <div className="rounded-lg bg-[var(--surface1)] p-3">
                  <p className="text-sm text-[var(--textSecondary)]">
                    Using the job’s shared list:{' '}
                    <span className="text-[var(--text)]">
                      {effective.map((c) => `${c.categoryName} (${c.weight}%)`).join(', ') || '—'}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => setOverride(effective.map((c) => ({ ...c })))}
                  >
                    Score this round differently
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {override.map((cat, index) => (
                    <div
                      key={index}
                      className="flex flex-wrap items-start gap-2 rounded-lg bg-[var(--surface1)] p-2"
                    >
                      <div className="min-w-[10rem] flex-1">
                        <Input
                          label=""
                          value={cat.categoryName}
                          placeholder="Category"
                          onChange={(e) => updateCategory(index, { categoryName: e.target.value })}
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          label=""
                          type="number"
                          min={0}
                          max={100}
                          value={String(cat.weight)}
                          onChange={(e) =>
                            updateCategory(index, { weight: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="min-w-[12rem] flex-[2]">
                        <Input
                          label=""
                          value={cat.description ?? ''}
                          placeholder="What this measures"
                          onChange={(e) => updateCategory(index, { description: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        title="Remove category"
                        onClick={() =>
                          setOverride((prev) => prev?.filter((_, i) => i !== index) ?? prev)
                        }
                        className="mt-1 rounded-lg p-2 text-[var(--textTertiary)] transition-colors hover:bg-[var(--surface2)] hover:text-[var(--error)]"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Plus size={14} />}
                      onClick={() =>
                        setOverride((prev) => [
                          ...(prev ?? []),
                          { categoryName: '', weight: 0, description: '' },
                        ])
                      }
                    >
                      Add category
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setOverride(null)}>
                      Go back to the shared list
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--border)] pt-4">
              <Button onClick={saveSettings} isLoading={saving} disabled={saving}>
                Save {INTERVIEW_ROUND_LABELS[round]} settings
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function toDraft(category: EvaluationCategory): DraftCategory {
  return {
    categoryName: category.categoryName,
    weight: category.weight,
    description: category.description,
  };
}
