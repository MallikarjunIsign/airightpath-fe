import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Code2, FileJson, FileSpreadsheet, FileText, ListChecks, Loader2, X } from 'lucide-react';
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
  type BankFilters,
  type BankLoad,
  type BankQuestion,
  type ExportContext,
} from '@/utils/question-bank.utils';

const PAGE_SIZE = 20;

type ExportKind = 'json' | 'excel' | 'pdf';

/**
 * Every question that has been generated or uploaded for an assessment, in one list.
 *
 * <p>Until now a question could be read only from inside the paper of one candidate's
 * assessment, so answering "have we already asked this?" or "what did we ask for this
 * job?" meant opening results one at a time. This is the whole bank, filterable, and
 * exportable as it is filtered.</p>
 */
export function QuestionBankPage() {
  const { showToast } = useToast();
  const [load, setLoad] = useState<BankLoad | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BankFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [includeAnswers, setIncludeAnswers] = useState(true);

  const fetchBank = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await questionBankService.getPapers();
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

  const all = useMemo(() => load?.questions ?? [], [load]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);

  // A filter can leave fewer pages than the one being viewed.
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

  const counts = useMemo(
    () => ({
      aptitude: filtered.filter((q) => q.type === 'APTITUDE').length,
      coding: filtered.filter((q) => q.type === 'CODING').length,
    }),
    [filtered],
  );

  const setFilter = <K extends keyof BankFilters>(key: K, value: BankFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description="Every aptitude and coding question that has been generated or uploaded for an assessment."
      />

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
            <Input
              label="Assigned from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)}
            />
            <Input
              label="Assigned until"
              type="date"
              value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)}
            />
            <div className="sm:col-span-2">
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
            <CardTitle>
              {loading ? 'Questions' : `Questions (${filtered.length}${filtered.length !== all.length ? ` of ${all.length}` : ''})`}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-xs text-[var(--textSecondary)]">
                <input
                  type="checkbox"
                  checked={includeAnswers}
                  onChange={(e) => setIncludeAnswers(e.target.checked)}
                  className="h-4 w-4"
                />
                Include answers in the PDF
              </label>
              <Button
                variant="outline"
                size="sm"
                leftIcon={exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                disabled={loading || filtered.length === 0 || exporting !== null}
                onClick={() => handleExport('pdf')}
              >
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={exporting === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                disabled={loading || filtered.length === 0 || exporting !== null}
                onClick={() => handleExport('excel')}
              >
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={exporting === 'json' ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
                disabled={loading || filtered.length === 0 || exporting !== null}
                onClick={() => handleExport('json')}
              >
                JSON
              </Button>
            </div>
          </div>
          {!loading && !failed && (
            <p className="mt-2 text-xs text-[var(--textSecondary)]">
              {counts.aptitude} aptitude · {counts.coding} coding. Exports contain exactly the questions in this list,
              all pages, not only the page on screen.
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

          {!loading && !failed && load && load.unreadablePapers > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
              {load.unreadablePapers} of {load.totalPapers} papers are not in a format this page can read as
              questions, so their questions are not listed.
            </p>
          )}

          {!loading && !failed && all.length === 0 && (
            <EmptyState
              icon={<ListChecks size={28} />}
              title="No questions yet"
              description="Questions appear here once a paper has been generated or uploaded in Assign Assessment."
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
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionRow({
  question: q,
  expanded,
  onToggle,
}: Readonly<{ question: BankQuestion; expanded: boolean; onToggle: () => void }>) {
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface1)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
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
            <span>{q.jobTitle ? `${q.jobTitle} · ${q.jobPrefix}` : q.jobPrefix}</span>
            {q.marks !== undefined && <span>{q.marks} mark{q.marks === 1 ? '' : 's'}</span>}
            {q.papers > 1 && <span>in {q.papers} papers</span>}
          </span>
        </span>
        <span className="flex-shrink-0 text-[var(--textTertiary)]">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] p-4 text-sm text-[var(--text)]">
          {q.type === 'APTITUDE' ? (
            <>
              <ul className="space-y-1">
                {q.options.map((o) => (
                  <li
                    key={o.key}
                    className={
                      o.key.toUpperCase() === q.correctAnswer.trim().toUpperCase().charAt(0) && q.correctAnswer
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
          <p className="flex items-center gap-1.5 border-t border-[var(--border)] pt-3 text-xs text-[var(--textTertiary)]">
            {q.generatedBy ? `Generated by ${q.generatedBy}. ` : ''}
            Given to {q.assignedTo} candidate{q.assignedTo === 1 ? '' : 's'}
            {q.lastAssignedAt ? `, last assigned ${formatServerDateTime(q.lastAssignedAt)}` : ''}.
          </p>
        </div>
      )}
    </li>
  );
}

function CodeBlock({ label, text }: Readonly<{ label: string; text: string }>) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--textTertiary)]">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface2)] p-3 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}
