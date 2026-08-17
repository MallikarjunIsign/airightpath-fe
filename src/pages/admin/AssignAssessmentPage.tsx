import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Loader2,
  ClipboardList,
  Send,
  Sparkles,
  Upload,
  Eye,
  Download,
  FileText,
  X,
  FileCog,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { BackLink } from '@/components/ui/BackLink';
import { QuestionPaperExportDialog } from '@/components/admin/QuestionPaperExportDialog';
import { ExamDurationFields } from '@/components/admin/ExamDurationFields';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { assessmentService } from '@/services/assessment.service';
import { promptService } from '@/services/prompt.service';
import { ROUTES } from '@/config/routes';
import { nowDateTimeLocal } from '@/utils/datetime.utils';
import { parseQuestionPaper } from '@/utils/question-paper.utils';
import {
  clampMinutesPerQuestion,
  defaultMinutesPerQuestion,
  effectiveQuestionCount,
} from '@/utils/exam-duration.utils';
import { MESSAGES } from '@/config/messages';
import { APP_CONFIG } from '@/config/app.config';
import type { JobPostDTO, JobApplicationDTO, JobApplicationStatus } from '@/types/job.types';

/**
 * Who may be assigned an exam.
 *
 * RECONFIRMED is the first round of the full pipeline. EXAM_SENT and
 * EXAM_COMPLETED are here because an exam round is not always one assignment: a
 * job may set aptitude first and add coding once it is sat, and listing only
 * RECONFIRMED made that impossible — the candidate left this screen the moment
 * their first paper was assigned, so their coding exam could never be created
 * and never appeared on their assessments list.
 *
 * APPLIED and SHORTLISTED are the direct route. A recruiter who already wants a
 * candidate examined can send the paper without walking them through the ack and
 * reconfirmation round-trip; the backend shortlists an applicant as part of the
 * assignment, so they still pass through SHORTLISTED on the way to EXAM_SENT.
 */
const ASSIGNABLE_STATUSES = new Set<JobApplicationStatus>([
  'APPLIED',
  'SHORTLISTED',
  'RECONFIRMED',
  'EXAM_SENT',
  'EXAM_COMPLETED',
]);

/** Marks a candidate who already has at least one exam for this job. */
function hasExamAlready(status: JobApplicationStatus): boolean {
  return status === 'EXAM_SENT' || status === 'EXAM_COMPLETED';
}

interface FileState {
  file: File | null;
  source: 'ai' | 'upload' | null;
}

/**
 * Questions in a paper, or null when the file isn't readable as one.
 *
 * Generated papers are JSON and count exactly; a PDF or Word upload doesn't,
 * and the admin types the number instead. Either way this only drives the total
 * shown on screen — the candidate's clock is recomputed from the real paper
 * when the exam opens, so a wrong guess here cannot shorten anyone's exam.
 */
async function countQuestionsInPaper(file: File): Promise<number | null> {
  try {
    const paper = parseQuestionPaper(await file.text());
    return paper.kind === 'raw' ? null : paper.items.length;
  } catch {
    return null;
  }
}

/**
 * Adds the timing config for one assessment type to the assign payload.
 *
 * `minutesPerQuestion` is the authoritative field — it is what the exam clock is
 * built from. The count and the total go along as `estimated*` so nobody
 * downstream mistakes an admin's typed guess for a duration the exam must obey.
 */
function appendTiming(
  form: FormData,
  prefix: 'aptitude' | 'coding',
  minutesPerQuestion: number,
  detectedCount: number | null,
  manualCount: string
): void {
  const minutes = clampMinutesPerQuestion(minutesPerQuestion);
  form.append(`${prefix}MinutesPerQuestion`, String(minutes));

  const count = effectiveQuestionCount(detectedCount, manualCount);
  if (count) {
    form.append(`${prefix}QuestionCount`, String(count));
    form.append(`${prefix}EstimatedDurationMinutes`, String(count * minutes));
  }
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

  // Per-question time, and the question counts used to show the resulting total.
  const [aptitudeMinutes, setAptitudeMinutes] = useState(defaultMinutesPerQuestion('APTITUDE'));
  const [codingMinutes, setCodingMinutes] = useState(defaultMinutesPerQuestion('CODING'));
  const [aptitudeCount, setAptitudeCount] = useState<number | null>(null);
  const [codingCount, setCodingCount] = useState<number | null>(null);
  const [aptitudeCountManual, setAptitudeCountManual] = useState('');
  const [codingCountManual, setCodingCountManual] = useState('');
  /** Paper being exported, with the heading its document should carry. */
  const [exporting, setExporting] = useState<{ file: File; title: string } | null>(null);

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

  /**
   * Prompt types configured for a job, upper-cased.
   *
   * Throws if the read fails, so each caller can decide what a failure means —
   * the label below treats it as "none", while the generate guard treats it as
   * "don't block". Collapsing those into one silent empty set would make a
   * network blip look like a missing prompt.
   */
  const fetchPromptTypes = useCallback(async (prefix: string): Promise<Set<string>> => {
    const res = await promptService.getByJob(prefix, { silent: true });
    // Tolerate both a raw array and an { data: [...] } envelope; normalize case.
    const body = res.data as unknown;
    let list: Array<{ promptType?: string }> = [];
    if (Array.isArray(body)) {
      list = body;
    } else if (Array.isArray((body as { data?: unknown })?.data)) {
      list = (body as { data: Array<{ promptType?: string }> }).data;
    }
    return new Set(list.map((p) => String(p.promptType ?? '').toUpperCase()).filter(Boolean));
  }, []);

  // Track which prompts this job already has, to label the button Edit vs Create.
  const refreshConfiguredPrompts = useCallback(
    async (prefix: string) => {
      if (!prefix) {
        setConfiguredPromptTypes(new Set());
        return;
      }
      try {
        setConfiguredPromptTypes(await fetchPromptTypes(prefix));
      } catch {
        setConfiguredPromptTypes(new Set());
      }
    },
    [fetchPromptTypes]
  );

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
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    navigate(ROUTES.ADMIN.PROMPTS, {
      state: {
        jobPrefix: selectedPrefix,
        // Hand the context back so returning restores the job and selection.
        from: {
          label: 'Assign Assessment',
          path: ROUTES.ADMIN.ASSESSMENTS_ASSIGN,
          state: { jobPrefix: selectedPrefix, emails: Array.from(selectedEmails) },
        },
      },
    });
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

  // Count each paper as it arrives so the admin sees the total exam time change
  // with the paper rather than having to work it out.
  useEffect(() => {
    const file = aptitudeFile.file;
    if (!file) {
      setAptitudeCount(null);
      return;
    }
    let cancelled = false;
    countQuestionsInPaper(file).then((count) => {
      if (!cancelled) setAptitudeCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [aptitudeFile.file]);

  useEffect(() => {
    const file = codingFile.file;
    if (!file) {
      setCodingCount(null);
      return;
    }
    let cancelled = false;
    countQuestionsInPaper(file).then((count) => {
      if (!cancelled) setCodingCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [codingFile.file]);

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
      const eligible = (res.data ?? []).filter((c) => ASSIGNABLE_STATUSES.has(c.status));
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

  /**
   * Whether this job has a prompt of the given type, checked before generating.
   *
   * Generation is driven by a per-job prompt; without one the server 404s and
   * the admin is told the "requested item couldn't be found", which names
   * neither the prompt nor the screen that fixes it. Asking first turns that
   * into a specific instruction — and avoids a pointless AI call.
   *
   * Best-effort: if the lookup itself fails we return true and let the
   * generate attempt proceed, so a blip in this check never blocks real work.
   */
  async function hasPromptFor(promptType: 'APTITUDE' | 'CODING'): Promise<boolean> {
    try {
      // Read fresh rather than trusting `configuredPromptTypes` — that is
      // refreshed on job change and window focus, so a prompt created in
      // another tab without refocusing this one would read as missing and
      // block a generate that would have worked.
      const types = await fetchPromptTypes(selectedPrefix);
      setConfiguredPromptTypes(types);
      return types.has(promptType);
    } catch {
      return true;
    }
  }

  async function handleGenerateAptitude() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    setGeneratingAptitude(true);
    try {
      if (!(await hasPromptFor('APTITUDE'))) {
        showToast(MESSAGES.admin.assign.promptMissing('aptitude'), 'warning');
        return;
      }
      const res = await assessmentService.generateQuestions(selectedPrefix);
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], `${selectedPrefix}_aptitude_questions.json`, {
        type: 'application/json',
      });
      setAptitudeFile({ file, source: 'ai' });
      showToast(MESSAGES.admin.assign.aptitudeGenerated, 'success');
    } catch {
      // Error toast auto-handled by interceptor. If the prompt isn't configured,
      // the admin can click "Create Prompt" to set it up on the Prompts screen.
    } finally {
      setGeneratingAptitude(false);
    }
  }

  async function handleGenerateCoding() {
    if (!selectedPrefix) {
      showToast(MESSAGES.admin.common.selectJobFirst, 'warning');
      return;
    }
    setGeneratingCoding(true);
    try {
      if (!(await hasPromptFor('CODING'))) {
        showToast(MESSAGES.admin.assign.promptMissing('coding'), 'warning');
        return;
      }
      const res = await assessmentService.generateCodingQuestions(selectedPrefix);
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], `${selectedPrefix}_coding_questions.json`, {
        type: 'application/json',
      });
      setCodingFile({ file, source: 'ai' });
      showToast(MESSAGES.admin.assign.codingGenerated, 'success');
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
      showToast(MESSAGES.admin.common.selectJob, 'warning');
      return;
    }
    if (!aptitudeChecked && !codingChecked) {
      showToast(MESSAGES.admin.assign.selectAssessmentType, 'warning');
      return;
    }
    if (aptitudeChecked && !aptitudeFile.file) {
      showToast(MESSAGES.admin.assign.aptitudePaperRequired, 'warning');
      return;
    }
    if (codingChecked && !codingFile.file) {
      showToast(MESSAGES.admin.assign.codingPaperRequired, 'warning');
      return;
    }
    if (selectedEmails.size === 0) {
      showToast(MESSAGES.admin.common.selectCandidate, 'warning');
      return;
    }
    // Catch a mistyped allowance here rather than silently clamping it — the
    // number decides how long every candidate gets.
    const minPerQ = APP_CONFIG.EXAM_MIN_MINUTES_PER_QUESTION;
    const maxPerQ = APP_CONFIG.EXAM_MAX_MINUTES_PER_QUESTION;
    const outOfRange = (minutes: number) => minutes < minPerQ || minutes > maxPerQ;
    if (
      (aptitudeChecked && outOfRange(aptitudeMinutes)) ||
      (codingChecked && outOfRange(codingMinutes))
    ) {
      showToast(MESSAGES.admin.assign.minutesPerQuestionInvalid(minPerQ, maxPerQ), 'warning');
      return;
    }
    if (!startTime) {
      showToast(MESSAGES.admin.assign.startTimeRequired, 'warning');
      return;
    }
    if (!deadline) {
      showToast(MESSAGES.admin.assign.deadlineRequired, 'warning');
      return;
    }
    // Reject past date/time and an out-of-order window before saving.
    const now = Date.now();
    if (new Date(startTime).getTime() < now) {
      showToast(MESSAGES.admin.assign.startInPast, 'warning');
      return;
    }
    if (new Date(deadline).getTime() < now) {
      showToast(MESSAGES.admin.assign.deadlineInPast, 'warning');
      return;
    }
    if (new Date(deadline).getTime() <= new Date(startTime).getTime()) {
      showToast(MESSAGES.admin.assign.deadlineBeforeStart, 'warning');
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
        appendTiming(formData, 'aptitude', aptitudeMinutes, aptitudeCount, aptitudeCountManual);
      }
      if (codingChecked && codingFile.file) {
        formData.append('codingQuestionPaper', codingFile.file);
        appendTiming(formData, 'coding', codingMinutes, codingCount, codingCountManual);
      }

      await assessmentService.assignMultipart(formData);
      showToast(MESSAGES.admin.assign.assigned, 'success');

      // Reset form
      setSelectedEmails(new Set());
      setStartTime('');
      setDeadline('');
      setAptitudeChecked(false);
      setCodingChecked(false);
      setAptitudeFile({ file: null, source: null });
      setCodingFile({ file: null, source: null });
      setAptitudeMinutes(defaultMinutesPerQuestion('APTITUDE'));
      setCodingMinutes(defaultMinutesPerQuestion('CODING'));
      setAptitudeCountManual('');
      setCodingCountManual('');

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
      {/* Shown only when another screen sent us here */}
      <BackLink />

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Assign Assessment</h1>
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
              searchable
              searchPlaceholder="Search by job title or prefix..."
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
                      title="View raw file"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExporting({
                          file: aptitudeFile.file!,
                          title: `${selectedPrefix} — Aptitude Question Paper`,
                        })
                      }
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--primary)]"
                      title="Download as PDF, Word or JSON"
                    >
                      <Download size={14} />
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

                <ExamDurationFields
                  type="APTITUDE"
                  minutesPerQuestion={aptitudeMinutes}
                  onMinutesPerQuestionChange={setAptitudeMinutes}
                  detectedCount={aptitudeCount}
                  manualCount={aptitudeCountManual}
                  onManualCountChange={setAptitudeCountManual}
                  disabled={submitting}
                />
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
                      title="View raw file"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExporting({
                          file: codingFile.file!,
                          title: `${selectedPrefix} — Coding Question Paper`,
                        })
                      }
                      className="p-1 hover:bg-[var(--surface2)] rounded text-[var(--primary)]"
                      title="Download as PDF, Word or JSON"
                    >
                      <Download size={14} />
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

                <ExamDurationFields
                  type="CODING"
                  minutesPerQuestion={codingMinutes}
                  onMinutesPerQuestionChange={setCodingMinutes}
                  detectedCount={codingCount}
                  manualCount={codingCountManual}
                  onManualCountChange={setCodingCountManual}
                  disabled={submitting}
                />
              </div>
            )}

            {/* Date/Time Pickers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DateTimeField
                label="Start Time"
                min={minDateTime}
                helperText="Cannot be in the past"
                value={startTime}
                onChange={setStartTime}
              />
              <DateTimeField
                label="Deadline"
                min={startTime || minDateTime}
                helperText="Must be after the start time"
                value={deadline}
                onChange={setDeadline}
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
                        {/* Says which of these candidates is on their second
                            paper, so an admin assigning coding does not wonder
                            why someone who has already sat aptitude is listed. */}
                        {hasExamAlready(c.status) && (
                          <Badge variant="info" size="sm" className="flex-shrink-0">
                            {c.status === 'EXAM_COMPLETED' ? 'Exam done' : 'Exam sent'}
                          </Badge>
                        )}
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

      {/* Format picker for downloading a generated paper */}
      {exporting && (
        <QuestionPaperExportDialog
          file={exporting.file}
          title={exporting.title}
          onClose={() => setExporting(null)}
        />
      )}
    </div>
  );
}
