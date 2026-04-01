import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, Save, Plus, X, BarChart3, Info, Copy, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import { jobService } from '@/services/job.service';
import type { JobPostDTO } from '@/types/job.types';
import type { EvaluationCategory } from '@/types/interview.types';

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

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(true);

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
      const res = await api.get<{ id: number; jobPrefix: string; promptType: string; promptStage: string; prompt: string }[]>(
        ENDPOINTS.PROMPTS.GET_BY_JOB(selectedPrefix)
      );
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
      const res = await api.get<EvaluationCategory[]>(
        ENDPOINTS.PROMPTS.GET_EVALUATION_CATEGORIES(selectedPrefix)
      );
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

  async function handleSave() {
    if (!selectedPrefix) {
      showToast('Please select a job', 'warning');
      return;
    }

    const tab = PROMPT_TABS.find((t) => t.key === activeTab);
    if (!tab) return;

    const content = promptContents[activeTab] ?? '';
    if (!content.trim()) {
      showToast('Prompt content cannot be empty', 'warning');
      return;
    }

    setSaving(true);
    try {
      await api.post(ENDPOINTS.PROMPTS.SAVE, {
        jobPrefix: selectedPrefix,
        promptType: tab.promptType,
        promptStage: tab.promptStage,
        prompt: content,
      });
      showToast(`${tab.label} prompt saved successfully!`, 'success');
      setExistingPromptKeys((prev) => new Set([...prev, activeTab]));
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInterview() {
    if (!selectedPrefix) {
      showToast('Please select a job', 'warning');
      return;
    }

    const startPrompt = promptContents['interview-start'] ?? '';
    if (!startPrompt.trim()) {
      showToast('Interview prompt cannot be empty', 'warning');
      return;
    }

    if (!evaluationInstructions.trim()) {
      showToast('Evaluation prompt cannot be empty', 'warning');
      return;
    }

    const catTotal = categories.reduce((sum, c) => sum + c.weight, 0);
    if (catTotal !== 100) {
      showToast(`Category weights must total 100% (currently ${catTotal}%)`, 'warning');
      return;
    }

    if (categories.some((c) => !c.categoryName.trim())) {
      showToast('All categories must have a name', 'warning');
      return;
    }

    setSavingInterview(true);
    try {
      const results = await Promise.allSettled([
        api.post(ENDPOINTS.PROMPTS.SAVE, {
          jobPrefix: selectedPrefix,
          promptType: 'INTERVIEW',
          promptStage: 'START',
          prompt: startPrompt,
        }),
        api.post(ENDPOINTS.PROMPTS.SAVE, {
          jobPrefix: selectedPrefix,
          promptType: 'INTERVIEW',
          promptStage: 'SUMMARY',
          prompt: evaluationInstructions,
        }),
        api.post(ENDPOINTS.PROMPTS.SAVE_EVALUATION_CATEGORIES, {
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
        showToast('Interview prompt saved successfully!', 'success');
        setExistingPromptKeys((prev) => new Set([...prev, 'interview-start']));
      } else if (failed.length === labels.length) {
        showToast('Failed to save interview prompt. Please try again.', 'error');
      } else {
        showToast(`Partially saved. Failed: ${failed.join(', ')}`, 'warning');
        setExistingPromptKeys((prev) => new Set([...prev, 'interview-start']));
      }
    } catch {
      showToast('An unexpected error occurred. Please try again.', 'error');
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

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Job Prompt</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Configure AI prompts and evaluation categories for each job
        </p>
      </div>

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
    </div>
  );
}
