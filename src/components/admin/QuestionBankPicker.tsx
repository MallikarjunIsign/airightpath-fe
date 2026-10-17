import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Info, Loader2, Sparkles, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { questionBankService } from '@/services/question-bank.service';
import {
  applyFilters,
  buildBank,
  buildPaperFile,
  distinct,
  EMPTY_FILTERS,
  type BankQuestion,
  type BankType,
} from '@/utils/question-bank.utils';

interface QuestionBankPickerProps {
  isOpen: boolean;
  onClose: () => void;
  jobPrefix: string;
  type: BankType;
  /** Handed the finished paper and how many questions it holds. */
  onUse: (file: File, count: number) => void;
}

const DEFAULT_COUNT: Record<BankType, number> = { APTITUDE: 10, CODING: 3 };

/**
 * Build a question paper out of questions that already exist.
 *
 * <p>The alternatives to this are waiting minutes for the AI to write a fresh paper, or preparing and
 * uploading a file by hand. This picks from the bank instead: the admin says how many questions the
 * paper should have, ticks that many in the order candidates should get them, and the paper is made
 * from exactly those. Questions that have never been given to anyone can be offered first, so a
 * candidate is not handed a question another already saw unless that is what the admin chose.</p>
 */
export function QuestionBankPicker({ isOpen, onClose, jobPrefix, type, onUse }: Readonly<QuestionBankPickerProps>) {
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState(String(DEFAULT_COUNT[type]));
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [otherJobs, setOtherJobs] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setSelectedIds([]);
    setTarget(String(DEFAULT_COUNT[type]));
    questionBankService
      .getItems()
      .then((res) => {
        if (!cancelled) setItems(buildBank(res.data ?? []).questions.filter((q) => q.type === type));
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, type]);

  const wanted = Math.max(0, Math.floor(Number(target) || 0));
  const byId = useMemo(() => new Map(items.map((q) => [q.id, q])), [items]);
  const chosen = selectedIds.map((id) => byId.get(id)).filter((q): q is BankQuestion => !!q);

  const pool = useMemo(
    () =>
      applyFilters(items, {
        ...EMPTY_FILTERS,
        jobPrefix: otherJobs ? '' : jobPrefix,
        difficulty,
        usage: unusedOnly ? 'UNUSED' : 'ALL',
        search,
      }),
    [items, otherJobs, jobPrefix, difficulty, unusedOnly, search],
  );
  const difficulties = useMemo(() => distinct(items, (q) => q.difficulty), [items]);

  const toggle = (id: number) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const move = (index: number, delta: -1 | 1) =>
    setSelectedIds((current) => {
      const next = [...current];
      const to = index + delta;
      if (to < 0 || to >= next.length) return current;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  /** Fill what is still missing from questions nobody has been given yet, oldest first. */
  const autoFill = () => {
    const missing = wanted - selectedIds.length;
    if (missing <= 0) return;
    const fresh = items
      .filter((q) => !selectedIds.includes(q.id) && q.timesAssigned === 0 && (otherJobs || q.jobPrefix === jobPrefix))
      .slice(0, missing)
      .map((q) => q.id);
    setSelectedIds((current) => [...current, ...fresh]);
  };

  const unusedAvailable = items.filter((q) => q.timesAssigned === 0 && (otherJobs || q.jobPrefix === jobPrefix)).length;
  const remaining = wanted - chosen.length;
  const canUse = wanted > 0 && chosen.length === wanted;
  const label = type === 'APTITUDE' ? 'aptitude' : 'coding';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Choose ${label} questions from the question bank`}
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[var(--textSecondary)]">
            {canUse
              ? `${chosen.length} questions selected, in the order shown.`
              : remaining > 0
                ? `Select ${remaining} more question${remaining === 1 ? '' : 's'} to reach ${wanted}.`
                : `Remove ${-remaining} question${remaining === -1 ? '' : 's'} to get down to ${wanted}.`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!canUse}
              onClick={() => {
                onUse(buildPaperFile(chosen, jobPrefix, type), chosen.length);
                onClose();
              }}
            >
              Use these questions
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-[var(--surface1)] p-3 text-xs text-[var(--textSecondary)]">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-[var(--primary)]" />
          <p>
            Decide how many questions the paper should have, tick that many on the left, then put them in the order
            candidates should get them using the arrows on the right. Nothing is generated, so there is no waiting for
            the AI. The paper is recorded against each candidate it is assigned to, so the bank can show who has seen
            each question and how often.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            label="Number of questions"
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <Input label="Search" placeholder="Words in the question…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            options={[{ value: '', label: 'Any' }, ...difficulties.map((d) => ({ value: d, label: d }))]}
          />
          <div className="flex flex-col justify-end gap-1 text-xs text-[var(--text)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} className="h-4 w-4" />
              Never assigned only
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={otherJobs} onChange={(e) => setOtherJobs(e.target.checked)} className="h-4 w-4" />
              Include other jobs
            </label>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-[var(--primary)]" size={24} />
          </div>
        )}
        {failed && <p className="text-sm text-[var(--textSecondary)]">The question bank could not be loaded.</p>}

        {!loading && !failed && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--text)]">
                  Available ({pool.length})
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Sparkles size={14} />}
                  disabled={remaining <= 0 || unusedAvailable === 0}
                  onClick={autoFill}
                  title="Add questions nobody has been given yet until the paper is full"
                >
                  Fill with never-assigned ({unusedAvailable})
                </Button>
              </div>
              {pool.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--textSecondary)]">
                  {items.length === 0
                    ? 'The bank has no questions of this kind yet. Generate or upload a paper, or read stored papers in on the Question Bank page.'
                    : 'No question matches. Try “Include other jobs” or clear the filters.'}
                </p>
              ) : (
                <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                  {pool.map((q) => {
                    const on = selectedIds.includes(q.id);
                    return (
                      <li key={q.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${
                            on ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'
                          }`}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggle(q.id)} className="mt-1 h-4 w-4 flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[var(--text)]">{q.text}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--textSecondary)]">
                              {q.difficulty && <Badge variant="secondary" size="sm">{q.difficulty}</Badge>}
                              <Badge variant={q.timesAssigned === 0 ? 'success' : 'default'} size="sm">
                                {q.timesAssigned === 0 ? 'Never assigned' : `Assigned ${q.timesAssigned}× · ${q.uniqueCandidates} candidate${q.uniqueCandidates === 1 ? '' : 's'}`}
                              </Badge>
                              {q.jobPrefix !== jobPrefix && <span>{q.jobPrefix}</span>}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">
                Order on the paper ({chosen.length} of {wanted || '—'})
              </h4>
              {chosen.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--textSecondary)]">
                  Nothing selected yet.
                </p>
              ) : (
                <ol className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                  {chosen.map((q, index) => (
                    <li key={q.id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-2.5 text-sm">
                      <span className="mt-0.5 w-6 flex-shrink-0 text-right text-xs font-semibold text-[var(--textSecondary)]">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 break-words text-[var(--text)]">{q.text}</span>
                      <span className="flex flex-shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"
                          className="rounded p-1 text-[var(--textSecondary)] hover:bg-[var(--surface2)] disabled:opacity-30">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === chosen.length - 1} aria-label="Move down"
                          className="rounded p-1 text-[var(--textSecondary)] hover:bg-[var(--surface2)] disabled:opacity-30">
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" onClick={() => toggle(q.id)} aria-label="Remove"
                          className="rounded p-1 text-[var(--textSecondary)] hover:bg-[var(--surface2)]">
                          <X size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
