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

const LEVEL_RANK = ['basic', 'easy', 'beginner', 'medium', 'intermediate', 'moderate', 'hard', 'advanced', 'difficult'];
const rankOf = (d: string) => {
  const i = LEVEL_RANK.indexOf(d.toLowerCase());
  return i < 0 ? 99 : i < 3 ? 0 : i < 6 ? 1 : 2;
};


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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  // 'ALL' rather than '' for "no filter": the dropdown treats an empty value as nothing chosen.
  const [difficulty, setDifficulty] = useState('ALL');
  const [show, setShow] = useState<'UNUSED' | 'ASSIGNED' | 'ALL'>('UNUSED');
  const [scope, setScope] = useState<'THIS' | 'ALL'>('THIS');
  const otherJobs = scope === 'ALL';
  const unusedOnly = show === 'UNUSED';
  const [perLevel, setPerLevel] = useState('2');
  const [pickKind, setPickKind] = useState<'UNUSED' | 'ASSIGNED' | 'ALL'>('UNUSED');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setSelectedIds([]);
    questionBankService
      .getItems()
      .then((res) => {
        if (cancelled) return;
        const all = buildBank(res.data ?? []).questions.filter((q) => q.type === type);
        setItems(all);
        // A job with nothing of its own would open an empty dialog; start from every job instead.
        setScope(all.some((q) => q.jobPrefix === jobPrefix && q.timesAssigned === 0) ? 'THIS' : 'ALL');
        setShow('UNUSED');
        setDifficulty('ALL');
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, type, jobPrefix]);

  const byId = useMemo(() => new Map(items.map((q) => [q.id, q])), [items]);
  const chosen = selectedIds.map((id) => byId.get(id)).filter((q): q is BankQuestion => !!q);

  const pool = useMemo(
    () =>
      applyFilters(items, {
        ...EMPTY_FILTERS,
        jobPrefix: otherJobs ? '' : jobPrefix,
        difficulty: difficulty === 'ALL' ? '' : difficulty,
        usage: show,
        search,
      }),
    [items, otherJobs, jobPrefix, difficulty, show, search],
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

  /**
   * N never-assigned questions from each difficulty level, easiest first, never more than the number of
   * questions asked for. Questions with no level only count when no question has one.
   */
  const fillPerLevel = () => {
    const n = Math.max(1, Math.floor(Number(perLevel) || 0));
    const fresh = quickPool;
    const known = fresh.filter((q) => q.difficulty);
    const pickFrom = known.length > 0 ? known : fresh;
    const levels = [...new Set(pickFrom.map((q) => q.difficulty || 'Unspecified'))].sort(
      (a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b),
    );
    const byLevel = levels.map((level) =>
      pickFrom.filter((q) => (q.difficulty || 'Unspecified') === level).slice(0, n).map((q) => q.id),
    );
    const limit = Infinity;
    const ids: number[] = [];
    // One from each level in turn, so a short count still spans the levels instead of exhausting the first.
    for (let round = 0; round < n && ids.length < limit; round++) {
      for (const list of byLevel) {
        if (round < list.length && ids.length < limit) ids.push(list[round]);
      }
    }
    // Back into level order for the paper.
    const position = new Map(byLevel.flat().map((id, index) => [id, index]));
    ids.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    setSelectedIds(ids);
  };

  /** What the quick pick draws from: the chosen kind of question, within the chosen jobs. */
  const quickPool = items.filter(
    (q) =>
      (otherJobs || q.jobPrefix === jobPrefix) &&
      (pickKind === 'ALL' || (pickKind === 'UNUSED' ? q.timesAssigned === 0 : q.timesAssigned > 0)),
  );
  const canUse = chosen.length > 0;
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
              ? `${chosen.length} question${chosen.length === 1 ? '' : 's'} selected, in the order shown.`
              : 'Pick the questions for the paper, or use the quick pick above.'}
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

        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--primary)] bg-[var(--primary)]/5 p-3 text-sm text-[var(--text)]">
          <Sparkles size={16} className="text-[var(--primary)]" />
          <span className="font-medium">Quick pick</span>
          <input
            type="number"
            min={1}
            value={perLevel}
            onChange={(e) => setPerLevel(e.target.value)}
            aria-label="Questions per level"
            className="h-9 w-16 rounded border border-[var(--border)] bg-transparent px-2"
          />
          <span>from each level, taken from</span>
          <div className="w-52">
            <Select
              aria-label="Kind of question to pick"
              value={pickKind}
              onChange={(e) => setPickKind(e.target.value as typeof pickKind)}
              options={[
                { value: 'UNUSED', label: 'Never-assigned questions' },
                { value: 'ASSIGNED', label: 'Already-assigned questions' },
                { value: 'ALL', label: 'Both' },
              ]}
            />
          </div>
          <Button
            size="sm"
            disabled={quickPool.length === 0}
            onClick={fillPerLevel}
            title="Replaces the selection with this many questions from each difficulty level"
          >
            Pick
          </Button>
          <span className="text-xs text-[var(--textSecondary)]">The number of questions follows from this.</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            label="Number of questions"
            value={String(chosen.length)}
            readOnly
            disabled
            title="Counted from the questions you select"
          />
          <Input label="Search" placeholder="Words in the question…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            options={[{ value: 'ALL', label: 'Any level' }, ...difficulties.map((d) => ({ value: d, label: d }))]}
          />
          <Select
            label="Show"
            value={show}
            onChange={(e) => setShow(e.target.value as typeof show)}
            options={[
              { value: 'UNUSED', label: 'Only never-assigned' },
              { value: 'ASSIGNED', label: 'Only already-assigned' },
              { value: 'ALL', label: 'Both' },
            ]}
          />
          <Select
            label="Jobs"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: 'THIS', label: 'This job only' },
              { value: 'ALL', label: 'All jobs' },
            ]}
          />
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
              </div>
              {pool.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--textSecondary)]">
                  {items.length === 0
                    ? 'The bank has no questions of this kind yet. Generate or upload a paper, or read stored papers in on the Question Bank page.'
                    : !otherJobs && items.some((q) => q.jobPrefix !== jobPrefix && (!unusedOnly || q.timesAssigned === 0))
                      ? `This job (${jobPrefix}) has no ${unusedOnly ? 'never-assigned ' : ''}${label} questions, but other jobs do. Set Jobs to “All jobs” to use them.`
                      : 'No question matches. Clear the filters.'}
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
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--text)]">
                  Order on the paper ({chosen.length} selected)
                </h4>
                <Button variant="ghost" size="sm" disabled={chosen.length === 0} onClick={() => setSelectedIds([])}>
                  Clear all
                </Button>
              </div>
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
