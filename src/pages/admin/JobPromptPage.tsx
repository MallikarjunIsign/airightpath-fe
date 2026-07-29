import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Sparkles, Save, Plus, X, BarChart3, Info, Copy, Check, ArrowLeft, Search, Briefcase } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { jobService } from '@/services/job.service';
import { promptService } from '@/services/prompt.service';
import { MESSAGES } from '@/config/messages';
import type { JobPostDTO } from '@/types/job.types';
import type { EvaluationCategory } from '@/types/interview.types';

function promptTypeLabels(prompts: { promptType: string }[]): string[] {
  const labels = new Set<string>();
  prompts.forEach((p) => {
    if (p.promptType === 'APTITUDE') labels.add('Aptitude');
    else if (p.promptType === 'CODING') labels.add('Coding');
    else if (p.promptType === 'INTERVIEW') labels.add('Interview');
  });
  return Array.from(labels);
}

const DEFAULT_CATEGORIES: Omit<EvaluationCategory, 'jobPrefix'>[] = [
  { categoryName: 'Technical Skills', weight: 30, description: 'Core technical knowledge and expertise' },
  { categoryName: 'Communication', weight: 20, description: 'Clarity and effectiveness of communication' },
  { categoryName: 'Problem Solving', weight: 20, description: 'Analytical thinking and approach to problems' },
  { categoryName: 'Behavioral & Culture Fit', weight: 15, description: 'Values alignment and teamwork' },
  { categoryName: 'Articulation & Confidence', weight: 15, description: 'Confidence, poise, and delivery' },
];

interface PromptTab {
  key: string;
  label: string;
  promptType: string;
  promptStage: string | null;
  description: string;
  placeholders: string[];
}

const JOB_PLACEHOLDERS = ['{{skills}}', '{{jobTitle}}', '{{experience}}', '{{education}}', '{{jobDescription}}', '{{companyName}}', '{{location}}', '{{role}}', '{{department}}', '{{jobPrefix}}'];

const PROMPT_TABS: PromptTab[] = [
  {
    key: 'aptitude',
    label: 'Aptitude',
    promptType: 'APTITUDE',
    promptStage: null,
    description: 'Prompt used to generate aptitude (MCQ) questions for this job.',
    placeholders: [],
  },
  {
    key: 'coding',
    label: 'Coding',
    promptType: 'CODING',
    promptStage: null,
    description: 'Prompt used to generate coding questions for this job.',
    placeholders: [],
  },
  {
    key: 'interview-start',
    label: 'Interview',
    promptType: 'INTERVIEW',
    promptStage: 'START',
    description: 'System prompt that guides the AI interviewer. This is sent at the start of every interview.',
    placeholders: [...JOB_PLACEHOLDERS, '{{email}}', '{{interviewerName}}', '{{categories}}'],
  },
];

export function JobPromptPage() {
  const { showToast } = useToast();
  const location = useLocation();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(true);

  // 'list' = browse existing prompts (default), 'edit' = configure a job's prompt
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [listSearch, setListSearch] = useState('');
  const [reuseFrom, setReuseFrom] = useState('');
  // Which prompt types each job already has (built by scanning all jobs).
  const [promptsByJob, setPromptsByJob] = useState<Record<string, string[]>>({});
  const [scanning, setScanning] = useState(true);

  // Prompt tabs state
  const [activeTab, setActiveTab] = useState(PROMPT_TABS[0].key);
  const [promptContents, setPromptContents] = useState<Record<string, string>>({});
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  // Placeholder copy state
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);

  const copyPlaceholder = useCallback(async (placeholder: string) => {
    try {
      await navigator.clipboard.writeText(placeholder);
      setCopiedPlaceholder(placeholder);
      setTimeout(() => setCopiedPlaceholder(null), 1500);
    } catch {
      // Fallback silently
    }
  }, []);

  // Evaluation categories state
  const [categories, setCategories] = useState<Omit<EvaluationCategory, 'jobPrefix'>[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Evaluation instructions state (INTERVIEW/SUMMARY prompt)
  const [evaluationInstructions, setEvaluationInstructions] = useState('');

  // Combined interview save state + existing prompt tracking
  const [savingInterview, setSavingInterview] = useState(false);
  const [existingPromptKeys, setExistingPromptKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchJobs();
  }, []);

  // Open directly in edit mode for a job when navigated here (e.g. from Assign).
  useEffect(() => {
    const navState = location.state as { jobPrefix?: string } | null;
    if (navState?.jobPrefix) {
      openEditor(navState.jobPrefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPrefix) {
      fetchPrompts();
      fetchCategories();
    } else {
      setPromptContents({});
      setCategories([]);
      setEvaluationInstructions('');
      setExistingPromptKeys(new Set());
    }
  }, [selectedPrefix]);

  // Scan every job to find which already have prompts (for the reuse list).
  useEffect(() => {
    if (jobs.length === 0) {
      setScanning(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setScanning(true);
      const entries = await Promise.all(
        jobs.map(async (job) => {
          try {
            const res = await promptService.getByJob(job.jobPrefix, { silent: true });
            return [job.jobPrefix, promptTypeLabels(res.data ?? [])] as const;
          } catch {
            return [job.jobPrefix, [] as string[]] as const;
          }
        })
      );
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      entries.forEach(([prefix, labels]) => {
        map[prefix] = labels;
      });
      setPromptsByJob(map);
      setScanning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  async function fetchJobs() {
    setLoadingJobs(true);
    try {
      const res = await jobService.getAllJobs();
      setJobs(res.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingJobs(false);
    }
  }

  async function fetchPrompts() {
    if (!selectedPrefix) return;
    setLoadingPrompt(true);
    try {
      const res = await promptService.getByJob(selectedPrefix);
      const prompts = res.data ?? [];
      const contents: Record<string, string> = {};
      for (const tab of PROMPT_TABS) {
        const match = prompts.find((p) => p.promptType === tab.promptType && (p.promptStage ?? null) === tab.promptStage);
        contents[tab.key] = match?.prompt ?? '';
      }
      setPromptContents(contents);

      // Extract INTERVIEW/SUMMARY prompt into evaluation instructions
      const summaryMatch = prompts.find((p) => p.promptType === 'INTERVIEW' && p.promptStage === 'SUMMARY');
      setEvaluationInstructions(summaryMatch?.prompt ?? '');

      // Track which prompts already exist (for Save vs Update label)
      const keys = new Set<string>();
      for (const [key, value] of Object.entries(contents)) {
        if (value) keys.add(key);
      }
      if (summaryMatch?.prompt) keys.add('interview-start');
      setExistingPromptKeys(keys);
    } catch {
      setPromptContents({});
      setEvaluationInstructions('');
      setExistingPromptKeys(new Set());
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function fetchCategories() {
    if (!selectedPrefix) return;
    setLoadingCategories(true);
    try {
      const res = await promptService.getEvaluationCategories(selectedPrefix);
      const data = res.data ?? [];
      if (data.length > 0) {
        setCategories(data.map(({ categoryName, weight, description, id }) => ({
          id,
          categoryName,
          weight,
          description,
        })));
      } else {
        setCategories([...DEFAULT_CATEGORIES]);
      }
    } catch {
      setCategories([...DEFAULT_CATEGORIES]);
    } finally {
      setLoadingCategories(false);
    }
  }

  function openEditor(prefix: string) {
    setReuseFrom('');
    setSelectedPrefix(prefix);
    setActiveTab(PROMPT_TABS[0].key);
    setMode('edit');
  }

  function openCreate() {
    openEditor('');
  }

  function backToList() {
    setSelectedPrefix('');
    setReuseFrom('');
    setMode('list');
    // Refresh which jobs have prompts so newly-saved ones show up.
    setJobs((prev) => [...prev]);
  }

  // Copy an existing job's prompts/categories into the current editor so they
  // can be reused for the selected job. The target job stays selectedPrefix.
  async function handleReuseFrom(sourcePrefix: string) {
    setReuseFrom(sourcePrefix);
    if (!sourcePrefix) return;
    setLoadingPrompt(true);
    try {
      const res = await promptService.getByJob(sourcePrefix, { silent: true });
      const prompts = res.data ?? [];
      const contents: Record<string, string> = {};
      for (const tab of PROMPT_TABS) {
        const match = prompts.find(
          (p) => p.promptType === tab.promptType && (p.promptStage ?? null) === tab.promptStage
        );
        contents[tab.key] = match?.prompt ?? '';
      }
      setPromptContents(contents);

      const summaryMatch = prompts.find((p) => p.promptType === 'INTERVIEW' && p.promptStage === 'SUMMARY');
      setEvaluationInstructions(summaryMatch?.prompt ?? '');

      try {
        const catRes = await promptService.getEvaluationCategories(sourcePrefix, { silent: true });
        const cats = catRes.data ?? [];
        if (cats.length > 0) {
          setCategories(cats.map(({ categoryName, weight, description }) => ({ categoryName, weight, description })));
        }
      } catch {
        // keep existing categories
      }

      const source = jobs.find((j) => j.jobPrefix === sourcePrefix);
      showToast(
        MESSAGES.admin.prompts.reuseCopied(source ? source.jobTitle : sourcePrefix),
        'info'
      );
    } catch {
      showToast(MESSAGES.admin.prompts.loadReuseFailed, 'error');
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function handleSave() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJob, 'warning');
      return;
    }

    const tab = PROMPT_TABS.find((t) => t.key === activeTab);
    if (!tab) return;

    const content = promptContents[activeTab] ?? '';
    if (!content.trim()) {
      showToast(MESSAGES.admin.prompts.contentEmpty, 'warning');
      return;
    }

    setSaving(true);
    try {
      await promptService.save({
        jobPrefix: selectedPrefix,
        promptType: tab.promptType,
        promptStage: tab.promptStage,
        prompt: content,
      });
      showToast(MESSAGES.admin.prompts.promptSaved(tab.label), 'success');
      setExistingPromptKeys((prev) => new Set([...prev, activeTab]));
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInterview() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJob, 'warning');
      return;
    }

    const startPrompt = promptContents['interview-start'] ?? '';
    if (!startPrompt.trim()) {
      showToast(MESSAGES.admin.prompts.interviewPromptEmpty, 'warning');
      return;
    }

    if (!evaluationInstructions.trim()) {
      showToast(MESSAGES.admin.prompts.evaluationPromptEmpty, 'warning');
      return;
    }

    const catTotal = categories.reduce((sum, c) => sum + c.weight, 0);
    if (catTotal !== 100) {
      showToast(MESSAGES.admin.prompts.weightsMustTotal(catTotal), 'warning');
      return;
    }

    if (categories.some((c) => !c.categoryName.trim())) {
      showToast(MESSAGES.admin.prompts.categoryNameRequired, 'warning');
      return;
    }

    setSavingInterview(true);
    try {
      const results = await Promise.allSettled([
        promptService.save({
          jobPrefix: selectedPrefix,
          promptType: 'INTERVIEW',
          promptStage: 'START',
          prompt: startPrompt,
        }),
        promptService.save({
          jobPrefix: selectedPrefix,
          promptType: 'INTERVIEW',
          promptStage: 'SUMMARY',
          prompt: evaluationInstructions,
        }),
        promptService.saveEvaluationCategories({
          jobPrefix: selectedPrefix,
          categories: categories.map((c) => ({
            ...c,
            jobPrefix: selectedPrefix,
          })),
        }),
      ]);

      const labels = ['Interview prompt', 'Evaluation prompt', 'Categories'];
      const failed = results
        .map((r, i) => (r.status === 'rejected' ? labels[i] : null))
        .filter(Boolean);

      if (failed.length === 0) {
        showToast(MESSAGES.admin.prompts.interviewSaved, 'success');
        setExistingPromptKeys((prev) => new Set([...prev, 'interview-start']));
      } else if (failed.length === labels.length) {
        showToast(MESSAGES.admin.prompts.interviewSaveFailed, 'error');
      } else {
        showToast(MESSAGES.admin.prompts.partiallySaved(failed.join(', ')), 'warning');
        setExistingPromptKeys((prev) => new Set([...prev, 'interview-start']));
      }
    } catch {
      showToast(MESSAGES.admin.prompts.unexpectedError, 'error');
    } finally {
      setSavingInterview(false);
    }
  }

  function addCategory() {
    setCategories((prev) => [...prev, { categoryName: '', weight: 0, description: '' }]);
  }

  function removeCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCategory(index: number, field: string, value: string | number) {
    setCategories((prev) =>
      prev.map((cat, i) => (i === index ? { ...cat, [field]: value } : cat))
    );
  }

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const currentTab = PROMPT_TABS.find((t) => t.key === activeTab)!;

  const jobOptions = [
    { value: '', label: 'Select a job' },
    ...jobs.map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobPrefix})` })),
  ];

  // Jobs that already have at least one prompt configured (for the list + reuse).
  const jobsWithPrompts = jobs.filter((j) => (promptsByJob[j.jobPrefix]?.length ?? 0) > 0);

  const listSearchLower = listSearch.toLowerCase();
  const filteredPromptJobs = jobsWithPrompts.filter(
    (j) =>
      !listSearch ||
      j.jobTitle.toLowerCase().includes(listSearchLower) ||
      j.jobPrefix.toLowerCase().includes(listSearchLower) ||
      (j.jobType ?? '').toLowerCase().includes(listSearchLower)
  );

  // Reuse source options: jobs with prompts, excluding the one being edited.
  const reuseOptions = [
    { value: '', label: 'Reuse prompts from…' },
    ...jobsWithPrompts
      .filter((j) => j.jobPrefix !== selectedPrefix)
      .map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobType || j.jobPrefix})` })),
  ];

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className={`mx-auto space-y-6 ${mode === 'list' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Job Prompt</h1>
          <p className="text-[var(--textSecondary)] mt-1">
            {mode === 'list'
              ? 'Reuse an existing job prompt or create a new one'
              : 'Configure AI prompts and evaluation categories for this job'}
          </p>
        </div>
        {mode === 'list' ? (
          <Button onClick={openCreate} leftIcon={<Plus size={18} />}>
            Create New Prompt
          </Button>
        ) : (
          <Button variant="ghost" onClick={backToList} leftIcon={<ArrowLeft size={18} />}>
            Back to prompts
          </Button>
        )}
      </div>

      {/* ── List view: existing prompts to reuse ─────────────────────── */}
      {mode === 'list' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-[var(--primary)]" />
              <CardTitle>Configured Job Prompts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="Search by job title, type, or prefix..."
                leftIcon={<Search size={18} />}
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />

              {scanning ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : filteredPromptJobs.length === 0 ? (
                <div className="text-center py-10">
                  <Briefcase size={44} className="mx-auto text-[var(--textTertiary)] mb-3" />
                  <p className="text-sm font-medium text-[var(--text)]">
                    {jobsWithPrompts.length === 0
                      ? 'No AI prompts configured yet'
                      : 'No jobs match your search'}
                  </p>
                  <p className="text-sm text-[var(--textSecondary)] mt-1">
                    Click “Create New Prompt” to configure one.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPromptJobs.map((job) => (
                    <button
                      key={job.id ?? job.jobPrefix}
                      type="button"
                      onClick={() => openEditor(job.jobPrefix)}
                      className="text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface1)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/[0.04] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text)] truncate">{job.jobTitle}</p>
                          <p className="text-xs text-[var(--textSecondary)] mt-0.5">
                            {job.jobType} · {job.jobPrefix}
                          </p>
                        </div>
                        <Badge variant="secondary" size="sm">Reuse</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(promptsByJob[job.jobPrefix] ?? []).map((t) => (
                          <Badge key={t} variant="primary" size="sm">{t}</Badge>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'edit' && (
      <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-[var(--primary)]" />
            <CardTitle>Prompt Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Job Selector */}
            <Select
              label="Select Job"
              options={jobOptions}
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />

            {/* Reuse an existing prompt as a starting point */}
            {selectedPrefix && reuseOptions.length > 1 && (
              <Select
                label="Reuse from existing job (optional)"
                options={reuseOptions}
                value={reuseFrom}
                onChange={(e) => handleReuseFrom(e.target.value)}
                helperText="Copies another job's prompts here so you can reuse and save them for this job."
              />
            )}

            {/* Prompt Content */}
            {selectedPrefix && (
              <>
                {loadingPrompt ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                  </div>
                ) : (
                  <>
                    {/* Prompt Type Tabs */}
                    <div className="flex gap-1 border-b border-[var(--border)]">
                      {PROMPT_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key)}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.key
                              ? 'border-[var(--primary)] text-[var(--primary)]'
                              : 'border-transparent text-[var(--textSecondary)] hover:text-[var(--text)] hover:border-[var(--border)]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab description */}
                    <p className="text-sm text-[var(--textSecondary)]">
                      {currentTab.description}
                    </p>

                    {/* Placeholders hint */}
                    {currentTab.placeholders.length > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--surface1)] text-sm">
                        <Info size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[var(--textSecondary)]">Available placeholders (click to copy): </span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {currentTab.placeholders.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => copyPlaceholder(p)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface2)] hover:bg-[var(--primary)]/10 text-[var(--text)] text-xs font-mono cursor-pointer transition-colors"
                                title={`Click to copy ${p}`}
                              >
                                {p}
                                {copiedPlaceholder === p ? (
                                  <Check size={10} className="text-[var(--success)]" />
                                ) : (
                                  <Copy size={10} className="text-[var(--textTertiary)]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <Textarea
                      label={`${currentTab.label} Content`}
                      placeholder={`Enter the ${currentTab.label.toLowerCase()} for this job...`}
                      value={promptContents[activeTab] ?? ''}
                      onChange={(e) => setPromptContents((prev) => ({ ...prev, [activeTab]: e.target.value }))}
                      maxLength={10000}
                      showCharCount
                      className="min-h-[250px]"
                    />

                    {currentTab.promptType !== 'INTERVIEW' && (
                      <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                        <Button
                          onClick={handleSave}
                          isLoading={saving}
                          leftIcon={!saving ? <Save size={16} /> : undefined}
                        >
                          {existingPromptKeys.has(activeTab) ? 'Update' : 'Save'} {currentTab.label} Prompt
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {!selectedPrefix && (
              <div className="text-center py-8">
                <Sparkles size={48} className="mx-auto text-[var(--textTertiary)] mb-3" />
                <p className="text-sm text-[var(--textSecondary)]">
                  Select a job above to configure its AI prompt
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Evaluation Configuration — only for interview tab */}
      {selectedPrefix && currentTab.promptType === 'INTERVIEW' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 size={20} className="text-[var(--primary)]" />
              <CardTitle>Evaluation Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCategories ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Evaluation Prompt */}
                <div className="space-y-4">
                  <p className="text-sm text-[var(--textSecondary)]">
                    Instructions for the AI when evaluating and scoring the completed interview.
                    Use <code className="px-1 py-0.5 rounded bg-[var(--surface2)] text-xs font-mono">{'{{categories}}'}</code> to reference the evaluation categories defined below.
                  </p>

                  {/* Placeholders */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--surface1)] text-sm">
                    <Info size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[var(--textSecondary)]">Available placeholders (click to copy): </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[...JOB_PLACEHOLDERS, '{{categories}}'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => copyPlaceholder(p)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface2)] hover:bg-[var(--primary)]/10 text-[var(--text)] text-xs font-mono cursor-pointer transition-colors"
                            title={`Click to copy ${p}`}
                          >
                            {p}
                            {copiedPlaceholder === p ? (
                              <Check size={10} className="text-[var(--success)]" />
                            ) : (
                              <Copy size={10} className="text-[var(--textTertiary)]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Textarea
                    label="Evaluation Prompt *"
                    placeholder="Enter evaluation prompt for this job..."
                    value={evaluationInstructions}
                    onChange={(e) => setEvaluationInstructions(e.target.value)}
                    maxLength={10000}
                    showCharCount
                    className="min-h-[180px]"
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--border)]" />

                {/* Categories Section */}
                <div className="space-y-4">
                  <p className="text-sm text-[var(--textSecondary)]">
                    Define the categories and weights used to evaluate candidates.
                    These are injected via <code className="px-1 py-0.5 rounded bg-[var(--surface2)] text-xs font-mono">{'{{categories}}'}</code> into both the interview and evaluation prompts.
                  </p>

                  {/* Category rows */}
                  <div className="space-y-3">
                    {categories.map((cat, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface1)]"
                      >
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <Input
                            label={index === 0 ? 'Category Name' : undefined}
                            placeholder="e.g., Communication"
                            value={cat.categoryName}
                            onChange={(e) => updateCategory(index, 'categoryName', e.target.value)}
                          />
                          <Input
                            label={index === 0 ? 'Weight (%)' : undefined}
                            type="number"
                            min={0}
                            max={100}
                            placeholder="0"
                            value={cat.weight}
                            onChange={(e) => updateCategory(index, 'weight', parseInt(e.target.value) || 0)}
                          />
                          <Input
                            label={index === 0 ? 'Description' : undefined}
                            placeholder="Brief description"
                            value={cat.description ?? ''}
                            onChange={(e) => updateCategory(index, 'description', e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCategory(index)}
                          className={`p-1.5 hover:bg-[var(--surface2)] rounded text-[var(--error)] ${index === 0 ? 'mt-6' : ''}`}
                          title="Remove category"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Category + Weight total */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addCategory}
                      leftIcon={<Plus size={14} />}
                    >
                      Add Category
                    </Button>

                    <span className="text-sm font-medium text-[var(--text)]">
                      Total:{' '}
                      <span
                        className={`font-semibold ${
                          totalWeight === 100
                            ? 'text-[var(--success)]'
                            : 'text-[var(--error)]'
                        }`}
                      >
                        {totalWeight}%
                      </span>
                      {totalWeight !== 100 && (
                        <span className="text-xs text-[var(--error)] ml-1">
                          (must equal 100%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Combined Save Button */}
                <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                  <Button
                    onClick={handleSaveInterview}
                    isLoading={savingInterview}
                    leftIcon={!savingInterview ? <Save size={16} /> : undefined}
                    disabled={totalWeight !== 100}
                  >
                    {existingPromptKeys.has('interview-start') ? 'Update' : 'Save'} Interview Prompt
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}
