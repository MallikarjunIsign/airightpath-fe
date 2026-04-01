import { useState, useEffect, useRef } from 'react';
import { Loader2, ClipboardList, Send, Sparkles, Upload, Eye, FileText, X } from 'lucide-react';
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
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

interface FileState {
  file: File | null;
  source: 'ai' | 'upload' | null;
}

export function AssignAssessmentPage() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [candidates, setCandidates] = useState<JobApplicationDTO[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState('');
  const [deadline, setDeadline] = useState('');

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

  // File input refs
  const aptitudeInputRef = useRef<HTMLInputElement>(null);
  const codingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedPrefix) {
      fetchCandidates();
    } else {
      setCandidates([]);
    }
    setSelectedEmails(new Set());
  }, [selectedPrefix]);

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
      // Error toast auto-handled by interceptor
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
      // Error toast auto-handled by interceptor
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
                <div className="flex flex-wrap gap-3">
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
                    variant="outline"
                    size="sm"
                    onClick={() => aptitudeInputRef.current?.click()}
                    leftIcon={<Upload size={14} />}
                    disabled={generatingAptitude || submitting}
                  >
                    Upload from Local
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
                <div className="flex flex-wrap gap-3">
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
                    variant="outline"
                    size="sm"
                    onClick={() => codingInputRef.current?.click()}
                    leftIcon={<Upload size={14} />}
                    disabled={generatingCoding || submitting}
                  >
                    Upload from Local
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
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                label="Deadline"
                type="datetime-local"
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
