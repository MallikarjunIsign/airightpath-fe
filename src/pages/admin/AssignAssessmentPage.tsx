import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ClipboardList, Send, Sparkles, Upload, Eye, FileText, X, FileCog } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { assessmentService } from '@/services/assessment.service';
import api from '@/services/api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import { ROUTES } from '@/config/routes';
import { nowDateTimeLocal } from '@/utils/datetime.utils';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

interface FileState {
  file: File | null;
  source: 'ai' | 'upload' | null;
}

export function AssignAssessmentPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Candidates to pre-select once they load (passed from the Candidate page).
  const pendingEmailsRef = useRef<string[] | null>(null);
  const preselectAppliedRef = useRef(false);

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [candidates, setCandidates] = useState<JobApplicationDTO[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState('');
  const [deadline, setDeadline] = useState('');
  // Floor for the date-time pickers (computed once on mount).
  const [minDateTime] = useState(nowDateTimeLocal);

  // Checkbox state for assessment types
  const [aptitudeChecked, setAptitudeChecked] = useState(false);
  const [codingChecked, setCodingChecked] = useState(false);

  // File state for each type
  const [aptitudeFile, setAptitudeFile] = useState<FileState>({ file: null, source: null });
  const [codingFile, setCodingFile] = useState<FileState>({ file: null, source: null });

  // Loading states
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [generatingAptitude, setGeneratingAptitude] = useState(false);
  const [generatingCoding, setGeneratingCoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prompt types already configured for the selected job (to label Edit vs Create).
  const [configuredPromptTypes, setConfiguredPromptTypes] = useState<Set<string>>(new Set());

  // File input refs
  const aptitudeInputRef = useRef<HTMLInputElement>(null);
  const codingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  // Pre-fill the job + candidates when navigated here from the Candidate page.
  useEffect(() => {
    if (preselectAppliedRef.current) return;
    const navState = location.state as { jobPrefix?: string; emails?: string[] } | null;
    if (navState?.jobPrefix) {
      preselectAppliedRef.current = true;
      pendingEmailsRef.current = navState.emails ?? null;
      setSelectedPrefix(navState.jobPrefix);
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedPrefix) {
      fetchCandidates();
    } else {
      setCandidates([]);
    }
    setSelectedEmails(new Set());
  }, [selectedPrefix]);

  // Track which prompts this job already has, to label the button Edit vs Create.
  const refreshConfiguredPrompts = useCallback(async (prefix: string) => {
    if (!prefix) {
      setConfiguredPromptTypes(new Set());
      return;
    }
    try {
      const res = await api.get(ENDPOINTS.PROMPTS.GET_BY_JOB(prefix), {
        _skipErrorToast: true,
      } as never);
      // Tolerate both a raw array and an { data: [...] } envelope; normalize case.
      const body = res.data as unknown;
      const list: Array<{ promptType?: string }> = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown })?.data)
          ? ((body as { data: Array<{ promptType?: string }> }).data)
          : [];
      setConfiguredPromptTypes(
        new Set(list.map((p) => String(p.promptType ?? '').toUpperCase()).filter(Boolean))
      );
    } catch {
      setConfiguredPromptTypes(new Set());
    }
  }, []);

  useEffect(() => {
    refreshConfiguredPrompts(selectedPrefix);
  }, [selectedPrefix, refreshConfiguredPrompts]);

  // Re-check when returning to this tab (e.g. after configuring on the Prompts screen).
  useEffect(() => {
    const onFocus = () => refreshConfiguredPrompts(selectedPrefix);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [selectedPrefix, refreshConfiguredPrompts]);

  // Go to the Prompts screen (with this job selected) to reuse/create/edit a prompt.
  function goToPromptScreen() {
    if (!selectedPrefix) {
      showToast('Please select a job first', 'warning');
      return;
    }
    navigate(ROUTES.ADMIN.PROMPTS, { state: { jobPrefix: selectedPrefix } });
  }

  // Apply the pending pre-selection once the candidate list has loaded.
  useEffect(() => {
    if (!pendingEmailsRef.current || candidates.length === 0) return;
    const wanted = new Set(pendingEmailsRef.current);
    const toSelect = new Set<string>();
    candidates.forEach((c) => {
      if (wanted.has(c.email) || (c.userEmail && wanted.has(c.userEmail))) {
        toSelect.add(c.email);
      }
    });
    if (toSelect.size > 0) setSelectedEmails(toSelect);
    pendingEmailsRef.current = null;
  }, [candidates]);

  // Clear file when checkbox unchecked
  useEffect(() => {
    if (!aptitudeChecked) setAptitudeFile({ file: null, source: null });
  }, [aptitudeChecked]);

  useEffect(() => {
    if (!codingChecked) setCodingFile({ file: null, source: null });
  }, [codingChecked]);

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

  async function fetchCandidates() {
    if (!selectedPrefix) return;
    setLoadingCandidates(true);
    try {
      const res = await jobApplicationService.getByPrefix(selectedPrefix);
      const eligible = (res.data ?? []).filter((c) => c.status === 'RECONFIRMED');
      setCandidates(eligible);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingCandidates(false);
    }
  }

  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAll() {
    if (selectedEmails.size === candidates.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(candidates.map((c) => c.email)));
    }
  }

  async function handleGenerateAptitude() {
    if (!selectedPrefix) {
      showToast('Please select a job first', 'warning');
      return;
    }
    setGeneratingAptitude(true);
    try {
      const res = await assessmentService.generateQuestions(selectedPrefix);
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], `${selectedPrefix}_aptitude_questions.json`, {
        type: 'application/json',
      });
      setAptitudeFile({ file, source: 'ai' });
      showToast('Aptitude questions generated successfully!', 'success');
    } catch {
      // Error toast auto-handled by interceptor. If the prompt isn't configured,
      // the admin can click "Create Prompt" to set it up on the Prompts screen.
    } finally {
      setGeneratingAptitude(false);
    }
  }

  async function handleGenerateCoding() {
    if (!selectedPrefix) {
      showToast('Please select a job first', 'warning');
      return;
    }
    setGeneratingCoding(true);
    try {
      const res = await assessmentService.generateCodingQuestions(selectedPrefix);
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], `${selectedPrefix}_coding_questions.json`, {
        type: 'application/json',
      });
      setCodingFile({ file, source: 'ai' });
      showToast('Coding questions generated successfully!', 'success');
    } catch {
      // Error toast auto-handled by interceptor.
    } finally {
      setGeneratingCoding(false);
    }
  }

  function handleFileUpload(type: 'aptitude' | 'coding', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'aptitude') {
      setAptitudeFile({ file, source: 'upload' });
    } else {
      setCodingFile({ file, source: 'upload' });
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function clearFile(type: 'aptitude' | 'coding') {
    if (type === 'aptitude') {
      setAptitudeFile({ file: null, source: null });
    } else {
      setCodingFile({ file: null, source: null });
    }
  }

  function viewFile(file: File) {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
  }

  async function handleSubmit() {
    if (!selectedPrefix) {
      showToast('Please select a job', 'warning');
      return;
    }
    if (!aptitudeChecked && !codingChecked) {
      showToast('Please select at least one assessment type', 'warning');
      return;
    }
    if (aptitudeChecked && !aptitudeFile.file) {
      showToast('Please upload or generate an aptitude question paper', 'warning');
      return;
    }
    if (codingChecked && !codingFile.file) {
      showToast('Please upload or generate a coding question paper', 'warning');
      return;
    }
    if (selectedEmails.size === 0) {
      showToast('Please select at least one candidate', 'warning');
      return;
    }
    if (!startTime) {
      showToast('Please set a start time', 'warning');
      return;
    }
    if (!deadline) {
      showToast('Please set a deadline', 'warning');
      return;
    }
    // Reject past date/time and an out-of-order window before saving.
    const now = Date.now();
    if (new Date(startTime).getTime() < now) {
      showToast('Start time cannot be in the past.', 'warning');
      return;
    }
    if (new Date(deadline).getTime() < now) {
      showToast('Deadline cannot be in the past.', 'warning');
      return;
    }
    if (new Date(deadline).getTime() <= new Date(startTime).getTime()) {
      showToast('Deadline must be after the start time.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('candidateEmails', Array.from(selectedEmails).join(','));
      formData.append('startTime', startTime);
      formData.append('deadline', deadline);
      formData.append('uploadedBy', user?.email ?? '');
      formData.append('jobPrefix', selectedPrefix);

      if (aptitudeChecked && aptitudeFile.file) {
        formData.append('aptitudeQuestionPaper', aptitudeFile.file);
      }
      if (codingChecked && codingFile.file) {
        formData.append('codingQuestionPaper', codingFile.file);
      }

      await assessmentService.assignMultipart(formData);
      showToast('Assessment assigned successfully!', 'success');

      // Reset form
      setSelectedEmails(new Set());
      setStartTime('');
      setDeadline('');
      setAptitudeChecked(false);
      setCodingChecked(false);
      setAptitudeFile({ file: null, source: null });
      setCodingFile({ file: null, source: null });

      // Refresh candidate list so assigned candidates (now EXAM_SENT) disappear
      if (selectedPrefix) fetchCandidates();
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSubmitting(false);
    }
  }

  const jobOptions = [
    { value: '', label: 'Select a job' },
    ...jobs.map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobPrefix})` })),
  ];

  const acceptedFileTypes = '.pdf,.doc,.docx,.xlsx,.json';

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Assign Assessment</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Select a job, choose candidates, and assign an assessment
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-[var(--primary)]" />
            <CardTitle>Assessment Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Job Selector */}
            <Select
              label="Job"
              options={jobOptions}
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />

            {/* Assessment Type Checkboxes */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-3">
                Assessment Type
              </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aptitudeChecked}
                    onChange={(e) => setAptitudeChecked(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                  />
                  <span className="text-sm text-[var(--text)]">Aptitude</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={codingChecked}
                    onChange={(e) => setCodingChecked(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                  />
                  <span className="text-sm text-[var(--text)]">Coding</span>
                </label>
              </div>
            </div>

            {/* Aptitude Section */}
            {aptitudeChecked && (
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Aptitude Question Paper
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAptitude}
                      isLoading={generatingAptitude}
                      leftIcon={!generatingAptitude ? <Sparkles size={14} /> : undefined}
                      disabled={submitting}
                    >
                      Generate via AI
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goToPromptScreen}
                      leftIcon={<FileCog size={14} />}
                      disabled={submitting}
                      title="Reuse another job's prompt or create/edit this job's prompt"
                    >
                      {configuredPromptTypes.has('APTITUDE') ? 'Edit Prompt' : 'Create Prompt'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[var(--textTertiary)]">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    or
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => aptitudeInputRef.current?.click()}
                    leftIcon={<Upload size={14} />}
                    disabled={generatingAptitude || submitting}
                  >
                    Upload from Local System
                  </Button>
                  <input
                    ref={aptitudeInputRef}
                    type="file"
                    accept={acceptedFileTypes}
                    className="hidden"
                    onChange={(e) => handleFileUpload('aptitude', e)}
                  />
                </div>

                {aptitudeFile.file && (
                  <div className="flex items-center gap-2 bg-[var(--surface1)] rounded-md px-3 py-2">
                    <FileText size={16} className="text-[var(--primary)] flex-shrink-0" />
                    <span className="text-sm text-[var(--text)] truncate flex-1">
                      {aptitudeFile.file.name}
                    </span>
                    <span className="text-xs text-[var(--textSecondary)] flex-shrink-0">
                      {aptitudeFile.source === 'ai' ? '(AI Generated)' : '(Uploaded)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => viewFile(aptitudeFile.file!)}
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--primary)]"
                      title="View file"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => clearFile('aptitude')}
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--error)]"
                      title="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Coding Section */}
            {codingChecked && (
              <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Coding Question Paper
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateCoding}
                      isLoading={generatingCoding}
                      leftIcon={!generatingCoding ? <Sparkles size={14} /> : undefined}
                      disabled={submitting}
                    >
                      Generate via AI
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goToPromptScreen}
                      leftIcon={<FileCog size={14} />}
                      disabled={submitting}
                      title="Reuse another job's prompt or create/edit this job's prompt"
                    >
                      {configuredPromptTypes.has('CODING') ? 'Edit Prompt' : 'Create Prompt'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[var(--textTertiary)]">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    or
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => codingInputRef.current?.click()}
                    leftIcon={<Upload size={14} />}
                    disabled={generatingCoding || submitting}
                  >
                    Upload from Local System
                  </Button>
                  <input
                    ref={codingInputRef}
                    type="file"
                    accept={acceptedFileTypes}
                    className="hidden"
                    onChange={(e) => handleFileUpload('coding', e)}
                  />
                </div>

                {codingFile.file && (
                  <div className="flex items-center gap-2 bg-[var(--surface1)] rounded-md px-3 py-2">
                    <FileText size={16} className="text-[var(--primary)] flex-shrink-0" />
                    <span className="text-sm text-[var(--text)] truncate flex-1">
                      {codingFile.file.name}
                    </span>
                    <span className="text-xs text-[var(--textSecondary)] flex-shrink-0">
                      {codingFile.source === 'ai' ? '(AI Generated)' : '(Uploaded)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => viewFile(codingFile.file!)}
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--primary)]"
                      title="View file"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => clearFile('coding')}
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--error)]"
                      title="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Date/Time Pickers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Start Time"
                type="datetime-local"
                min={minDateTime}
                helperText="Cannot be in the past"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                label="Deadline"
                type="datetime-local"
                min={startTime || minDateTime}
                helperText="Must be after the start time"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            {/* Candidate Selection */}
            {selectedPrefix && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[var(--text)]">
                    Select Candidates ({selectedEmails.size} selected)
                  </label>
                  {candidates.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      {selectedEmails.size === candidates.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                  </div>
                ) : candidates.length === 0 ? (
                  <EmptyState
                    title="No candidates"
                    description="No candidates have applied for this job yet."
                  />
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                    {candidates.map((c) => (
                      <label
                        key={c.email}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface1)] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(c.email)}
                          onChange={() => toggleEmail(c.email)}
                          className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)]">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="text-xs text-[var(--textSecondary)] truncate">
                            {c.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-4 border-t border-[var(--border)]">
              <Button
                onClick={handleSubmit}
                isLoading={submitting}
                leftIcon={!submitting ? <Send size={16} /> : undefined}
              >
                Assign Assessment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
