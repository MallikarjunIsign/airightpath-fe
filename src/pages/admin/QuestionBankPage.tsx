import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Code2,
  FileJson,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { questionBankService } from '@/services/question-bank.service';
import { downloadBlob } from '@/utils/question-paper.utils';
import { formatServerDateTime } from '@/utils/format.utils';
import {
  EMPTY_FILTERS,
  applyFilters,
  bankFilename,
  buildBank,
  buildBankJson,
  buildBankPdf,
  buildBankWorkbook,
  distinct,
  filtersActive,
  repetitionByCandidate,
  totalsOf,
  type BankAssignment,
  type BankFilters,
  type BankLoad,
  type BankQuestion,
  type BankSyncStatus,
  type ExportContext,
} from '@/utils/question-bank.utils';

const PAGE_SIZE = 20;

type ExportKind = 'json' | 'excel' | 'pdf';

/**
 * Every question that has been generated or assigned, in one list, with how it has been used.
 *
 * <p>The bank answers the questions an admin actually has: what do we have for this job, which of it
 * has never been put in front of anyone, how many times has this one been given, and to whom. The
 * questions come from three places — the AI generator, uploaded files, and the papers already stored
 * from before any of this was tracked — and "Read from S3" brings the last of those in.</p>
 */
export function QuestionBankPage() {
  const { showToast } = useToast();
  const [load, setLoad] = useState<BankLoad | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BankFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [sync, setSync] = useState<BankSyncStatus | null>(null);
  const syncPoll = useRef<number | null>(null);

  const fetchBank = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await questionBankService.getItems();
      setLoad(buildBank(res.data ?? []));
    } catch {
      setFailed(true);
      // The error toast comes from the interceptor.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBank();
  }, [fetchBank]);

  // Pick up a sync that is already running (started earlier, or by someone else).
  const stopPolling = useCallback(() => {
    if (syncPoll.current != null) {
      window.clearInterval(syncPoll.current);
      syncPoll.current = null;
    }
  }, []);

  const pollSync = useCallback(() => {
    stopPolling();
    const tick = async () => {
      try {
        const res = await questionBankService.getSyncStatus();
        setSync(res.data);
        if (!res.data.running) {
          stopPolling();
          void fetchBank();
        }
      } catch {
        stopPolling();
      }
    };
    void tick();
    syncPoll.current = window.setInterval(tick, 2000);
  }, [fetchBank, stopPolling]);

  useEffect(() => {
    questionBankService
      .getSyncStatus()
      .then((res) => {
        setSync(res.data);
        if (res.data.running) pollSync();
      })
      .catch(() => undefined);
    return stopPolling;
  }, [pollSync, stopPolling]);

  async function handleSync() {
    try {
      const res = await questionBankService.startSync();
      setSync(res.data);
      pollSync();
    } catch {
      // The error toast comes from the interceptor.
    }
  }

  const all = useMemo(() => load?.questions ?? [], [load]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const totals = useMemo(() => totalsOf(all), [all]);

  useEffect(() => setPage(1), [filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const jobs = useMemo(() => {
    const seen = new Map<string, string>();
    all.forEach((q) => seen.set(q.jobPrefix, q.jobTitle));
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const difficulties = useMemo(() => distinct(all, (q) => q.difficulty), [all]);
  const authors = useMemo(() => distinct(all, (q) => q.generatedBy), [all]);

  const setFilter = <K extends keyof BankFilters>(key: K, value: BankFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // What the list is a list of. A coding-only view says it is coding questions and counts those,
  // rather than "14 of 252" — 252 is the whole bank, and most of it is not what is on screen.
  const kindLabel =
    filters.type === 'CODING' ? 'Coding questions' : filters.type === 'APTITUDE' ? 'Aptitude questions' : 'Questions';
  const kindTotal =
    filters.type === 'CODING' ? totals.coding : filters.type === 'APTITUDE' ? totals.aptitude : totals.total;
  const narrowed = filtered.length !== kindTotal;

  async function handleExport(kind: ExportKind) {
    if (filtered.length === 0) {
      showToast('There are no questions to export with the current filters.', 'warning');
      return;
    }
    const context: ExportContext = { filters, totalInBank: all.length, generatedAt: new Date() };
    setExporting(kind);
    try {
      if (kind === 'json') {
        downloadBlob(buildBankJson(filtered, context), bankFilename('json', context));
      } else if (kind === 'excel') {
        downloadBlob(await buildBankWorkbook(filtered, context), bankFilename('xlsx', context));
      } else {
        downloadBlob(await buildBankPdf(filtered, context, { includeAnswers }), bankFilename('pdf', context));
      }
      showToast(`Exported ${filtered.length} question${filtered.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Question bank export failed:', err);
      showToast('The export could not be created. Please try again.', 'error');
    } finally {
      setExporting(null);
    }
  }

  const exportDisabled = loading || filtered.length === 0 || exporting !== null;

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description="Every aptitude and coding question that has been generated or assigned, and how each has been used."
      />

      {/* How the bank stands. Clicking a figure filters to it. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="In the bank" value={totals.total} active={filters.type === 'ALL' && filters.usage === 'ALL'}
          onClick={() => setFilters({ ...EMPTY_FILTERS })} />
        <Tile label="Aptitude" value={totals.aptitude} active={filters.type === 'APTITUDE'}
          onClick={() => setFilter('type', 'APTITUDE')} />
        <Tile label="Coding" value={totals.coding} active={filters.type === 'CODING'}
          onClick={() => setFilter('type', 'CODING')} />
        <Tile label="Assigned at least once" value={totals.assigned} active={filters.usage === 'ASSIGNED'}
          onClick={() => setFilter('usage', 'ASSIGNED')} />
        <Tile label="Never assigned" value={totals.unused} active={filters.usage === 'UNUSED'} tone="good"
          onClick={() => setFilter('usage', 'UNUSED')} />
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Cloud size={20} className="mt-0.5 flex-shrink-0 text-[var(--primary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Papers already in S3</p>
                <p className="text-xs text-[var(--textSecondary)]">
                  Reads the question papers stored with each candidate's assessment and adds their questions, and who
                  was given them, to the bank. Only papers not yet read are fetched, so it is safe to run again.
                </p>
                {sync && (sync.running || sync.finishedAt) && (
                  <p className="mt-1 text-xs text-[var(--textSecondary)]">
                    {sync.running
                      ? `Reading ${sync.processed} of ${sync.total} papers…`
                      : `${sync.message}. ${sync.total} paper${sync.total === 1 ? '' : 's'} read, ${sync.newQuestions} new question${sync.newQuestions === 1 ? '' : 's'}, ${sync.newAssignments} assignment${sync.newAssignments === 1 ? '' : 's'} recorded${sync.failed ? `, ${sync.failed} failed` : ''}${sync.finishedAt ? ` (${formatServerDateTime(sync.finishedAt)})` : ''}.`}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={sync?.running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              disabled={!!sync?.running}
              onClick={handleSync}
            >
              {sync?.running ? 'Reading…' : 'Read from S3'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Type"
              value={filters.type}
              onChange={(e) => setFilter('type', e.target.value as BankFilters['type'])}
              options={[
                { value: 'ALL', label: 'Aptitude and coding' },
                { value: 'APTITUDE', label: 'Aptitude' },
                { value: 'CODING', label: 'Coding' },
              ]}
            />
            <Select
              label="Usage"
              value={filters.usage}
              onChange={(e) => setFilter('usage', e.target.value as BankFilters['usage'])}
              options={[
                { value: 'ALL', label: 'Any' },
                { value: 'UNUSED', label: 'Never assigned to anyone' },
                { value: 'ASSIGNED', label: 'Assigned at least once' },
              ]}
            />
            <Select
              label="Job"
              value={filters.jobPrefix}
              onChange={(e) => setFilter('jobPrefix', e.target.value)}
              options={[
                { value: '', label: 'All jobs' },
                ...jobs.map(([prefix, title]) => ({ value: prefix, label: title ? `${title} (${prefix})` : prefix })),
              ]}
            />
            <Select
              label="Difficulty"
              value={filters.difficulty}
              onChange={(e) => setFilter('difficulty', e.target.value)}
              options={[{ value: '', label: 'Any difficulty' }, ...difficulties.map((d) => ({ value: d, label: d }))]}
            />
            <Select
              label="Generated by"
              value={filters.generatedBy}
              onChange={(e) => setFilter('generatedBy', e.target.value)}
              options={[{ value: '', label: 'Anyone' }, ...authors.map((a) => ({ value: a, label: a }))]}
            />
            <Select
              label="First came from"
              value={filters.source}
              onChange={(e) => setFilter('source', e.target.value as BankFilters['source'])}
              options={[
                { value: 'ALL', label: 'Anywhere' },
                { value: 'AI_GENERATED', label: 'AI generation' },
                { value: 'UPLOADED', label: 'An uploaded or stored paper' },
              ]}
            />
            <Input label="Last assigned from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            <Input label="Last assigned until" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            <div className="sm:col-span-2 lg:col-span-4">
              <Input
                label="Search"
                placeholder="Words in the question, an option, the job…"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>
          </div>
          {filtersActive(filters) && (
            <div className="mt-4">
              <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>{loading ? 'Questions' : `${kindLabel} (${filtered.length})`}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-xs text-[var(--textSecondary)]">
                <input type="checkbox" checked={includeAnswers} onChange={(e) => setIncludeAnswers(e.target.checked)} className="h-4 w-4" />
                Include answers in the PDF
              </label>
              <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => handleExport('pdf')}
                leftIcon={exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}>
                PDF
              </Button>
              <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => handleExport('excel')}
                leftIcon={exporting === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}>
                Excel
              </Button>
              <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => handleExport('json')}
                leftIcon={exporting === 'json' ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}>
                JSON
              </Button>
            </div>
          </div>
          {!loading && !failed && (
            <p className="mt-2 text-xs text-[var(--textSecondary)]">
              {narrowed
                ? `Showing ${filtered.length} of the ${kindTotal} ${kindLabel.toLowerCase()} in the bank. `
                : `All ${kindTotal} ${kindLabel.toLowerCase()} in the bank. `}
              Exports contain exactly this list, every page, not only the page on screen.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-[var(--primary)]" size={28} />
            </div>
          )}

          {!loading && failed && (
            <EmptyState
              icon={<ListChecks size={28} />}
              title="The question bank could not be loaded"
              description="You may not have permission, or the server did not answer."
              action={{ label: 'Retry', onClick: fetchBank }}
            />
          )}

          {!loading && !failed && load && load.unreadable > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
              {load.unreadable} stored question{load.unreadable === 1 ? '' : 's'} could not be read and are not listed.
            </p>
          )}

          {!loading && !failed && all.length === 0 && (
            <EmptyState
              icon={<Cloud size={28} />}
              title="The bank is empty"
              description="Questions appear here as they are generated or assigned. For papers assigned before this was tracked, use “Read from S3” above."
            />
          )}

          {!loading && !failed && all.length > 0 && filtered.length === 0 && (
            <EmptyState
              icon={<ListChecks size={28} />}
              title="No questions match these filters"
              action={{ label: 'Clear filters', onClick: () => setFilters(EMPTY_FILTERS) }}
            />
          )}

          <ul className="space-y-3">
            {visible.map((q) => (
              <QuestionRow key={q.id} question={q} expanded={open.has(q.id)} onToggle={() => toggle(q.id)} />
            ))}
          </ul>

          {!loading && totalPages > 1 && (
            <div className="mt-6">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  active,
  tone,
  onClick,
}: Readonly<{ label: string; value: number; active: boolean; tone?: 'good'; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${
        active ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] bg-[var(--surface1)] hover:border-[var(--primary)]'
      }`}
    >
      <p className={`text-2xl font-bold ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--textSecondary)]">{label}</p>
    </button>
  );
}

function usageText(q: BankQuestion): string {
  if (q.timesAssigned === 0) return 'Never assigned';
  return `Assigned ${q.timesAssigned}× · ${q.uniqueCandidates} candidate${q.uniqueCandidates === 1 ? '' : 's'}`;
}

function QuestionRow({
  question: q,
  expanded,
  onToggle,
}: Readonly<{ question: BankQuestion; expanded: boolean; onToggle: () => void }>) {
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface1)]">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mt-0.5 flex-shrink-0 text-[var(--primary)]">
          {q.type === 'CODING' ? <Code2 size={18} /> : <ListChecks size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-[var(--text)]">{q.text || '(no text)'}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--textSecondary)]">
            <Badge variant={q.type === 'CODING' ? 'info' : 'success'} size="sm">
              {q.type === 'CODING' ? 'Coding' : 'Aptitude'}
            </Badge>
            {q.difficulty && <Badge variant="secondary" size="sm">{q.difficulty}</Badge>}
            <Badge variant={q.timesAssigned === 0 ? 'warning' : 'default'} size="sm">{usageText(q)}</Badge>
            <span>{q.jobTitle ? `${q.jobTitle} · ${q.jobPrefix}` : q.jobPrefix}</span>
            {q.marks !== undefined && <span>{q.marks} mark{q.marks === 1 ? '' : 's'}</span>}
          </span>
        </span>
        <span className="flex-shrink-0 text-[var(--textTertiary)]">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {expanded && <QuestionDetail question={q} />}
    </li>
  );
}

function QuestionDetail({ question: q }: Readonly<{ question: BankQuestion }>) {
  const [assignments, setAssignments] = useState<BankAssignment[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (q.timesAssigned === 0) {
      setAssignments([]);
      return;
    }
    let cancelled = false;
    questionBankService
      .getAssignments(q.id)
      .then((res) => !cancelled && setAssignments(res.data ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [q.id, q.timesAssigned]);

  const people = useMemo(() => repetitionByCandidate(assignments ?? []), [assignments]);
  const repeats = people.filter((p) => p.times > 1).length;

  return (
    <div className="space-y-3 border-t border-[var(--border)] p-4 text-sm text-[var(--text)]">
      {q.type === 'APTITUDE' ? (
        <>
          <ul className="space-y-1">
            {q.options.map((o) => (
              <li
                key={o.key}
                className={
                  q.correctAnswer && o.key.toUpperCase() === q.correctAnswer.trim().toUpperCase().charAt(0)
                    ? 'font-medium text-emerald-600 dark:text-emerald-400'
                    : ''
                }
              >
                {o.key}. {o.text}
              </li>
            ))}
          </ul>
          {q.correctAnswer && <p><span className="text-[var(--textSecondary)]">Correct answer: </span>{q.correctAnswer}</p>}
          {q.explanation && <p><span className="text-[var(--textSecondary)]">Explanation: </span>{q.explanation}</p>}
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap">{q.description}</p>
          {q.sampleInput && <CodeBlock label="Sample input" text={q.sampleInput} />}
          {q.sampleOutput && <CodeBlock label="Sample output" text={q.sampleOutput} />}
          {q.constraints && <CodeBlock label="Constraints" text={q.constraints} />}
          {q.testCases.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--textTertiary)]">
                Test cases ({q.testCases.length}, {q.testCases.filter((tc) => tc.isHidden).length} hidden)
              </p>
              <ul className="space-y-1">
                {q.testCases.map((tc, i) => (
                  <li key={i} className="break-words font-mono text-xs">
                    {tc.input} → {tc.expectedOutput}
                    {tc.isHidden && <span className="ml-2 text-[var(--textTertiary)]">(hidden)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.solution && <CodeBlock label="Reference solution" text={q.solution} />}
        </>
      )}

      <div className="border-t border-[var(--border)] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--textTertiary)]">
          Given to candidates
        </p>
        {assignments === null && !failed && <Loader2 size={16} className="animate-spin text-[var(--textSecondary)]" />}
        {failed && <p className="text-xs text-[var(--textSecondary)]">Who received this could not be loaded.</p>}
        {assignments && assignments.length === 0 && (
          <p className="text-xs text-[var(--textSecondary)]">
            No one has been given this question yet
            {q.source === 'AI_GENERATED' ? ' — it was generated and has not been assigned' : ''}.
          </p>
        )}
        {assignments && assignments.length > 0 && (
          <>
            <p className="mb-2 text-xs text-[var(--textSecondary)]">
              Assigned {assignments.length} time{assignments.length === 1 ? '' : 's'} to {people.length} different
              candidate{people.length === 1 ? '' : 's'}
              {repeats > 0 ? `; ${repeats} of them received it more than once` : ''}.
              {q.lastAssignedAt ? ` Last assigned ${formatServerDateTime(q.lastAssignedAt)}.` : ''}
            </p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {people.map((p) => (
                <li key={p.email} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">{p.email}</span>
                  <span className={p.times > 1 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-[var(--textSecondary)]'}>
                    {p.times}× · {p.last ? formatServerDateTime(p.last) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="text-xs text-[var(--textTertiary)]">
        {q.source === 'AI_GENERATED' ? 'First generated by AI' : 'First seen on an uploaded or stored paper'}
        {q.generatedBy ? ` by ${q.generatedBy}` : ''}, {formatServerDateTime(q.createdAt)}.
      </p>
    </div>
  );
}

function CodeBlock({ label, text }: Readonly<{ label: string; text: string }>) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--textTertiary)]">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface2)] p-3 font-mono text-xs">{text}</pre>
    </div>
  );
}
