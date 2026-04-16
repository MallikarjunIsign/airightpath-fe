import { useState, useEffect } from 'react';
import { Loader2, Video, Send, Mail, Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { interviewService } from '@/services/interview.service';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

export function InterviewSchedulerPage() {
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [candidates, setCandidates] = useState<JobApplicationDTO[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [deadlineTime, setDeadlineTime] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [questionsFromDate, setQuestionsFromDate] = useState('');
  const [questionsToDate, setQuestionsToDate] = useState('');

  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      // Filter to candidates who have passed assessment (EXAM_COMPLETED or later stages)
      const eligibleStatuses = ['EXAM_COMPLETED'];
      const eligible = (res.data ?? []).filter((c) =>
        eligibleStatuses.includes(c.status)
      );
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

  async function handleSubmit() {
    if (!selectedPrefix) {
      showToast('Please select a job', 'warning');
      return;
    }
    if (selectedEmails.size === 0) {
      showToast('Please select at least one candidate', 'warning');
      return;
    }
    if (!deadlineTime) {
      showToast('Please set a deadline time', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await interviewService.assignInterviewBulk({
        emails: Array.from(selectedEmails),
        jobPrefix: selectedPrefix,
        deadlineTime,
        sendEmail,
        questionsFromDate: questionsFromDate || undefined,
        questionsToDate: questionsToDate || undefined,
      });
      showToast(
        `Interview${selectedEmails.size > 1 ? 's' : ''} scheduled for ${selectedEmails.size} candidate${selectedEmails.size > 1 ? 's' : ''}!`,
        'success'
      );
      setSelectedEmails(new Set());
      setDeadlineTime('');
      setQuestionsFromDate('');
      setQuestionsToDate('');

      // Refresh candidate list so scheduled candidates disappear
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
        <h1 className="text-3xl font-bold text-[var(--text)]">Schedule Interview</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Assign AI interviews to candidates who have completed their assessments
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video size={20} className="text-[var(--primary)]" />
            <CardTitle>Interview Details</CardTitle>
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
                    title="No eligible candidates"
                    description="No candidates have completed their assessment for this job yet."
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

            {/* Deadline */}
            <Input
              label="Interview Deadline"
              type="datetime-local"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
            />

            {/* Question Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Questions From Date (optional)"
                type="date"
                value={questionsFromDate}
                onChange={(e) => setQuestionsFromDate(e.target.value)}
                leftIcon={<Calendar size={16} />}
              />
              <Input
                label="Questions To Date (optional)"
                type="date"
                value={questionsToDate}
                onChange={(e) => setQuestionsToDate(e.target.value)}
                leftIcon={<Calendar size={16} />}
              />
            </div>
            <p className="text-xs text-[var(--textTertiary)] -mt-4">
              If provided, only questions created within this date range will be asked.
            </p>

            {/* Email Notification Toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
              />
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-[var(--textSecondary)]" />
                <span className="text-sm text-[var(--text)]">
                  Send email notification to candidates
                </span>
              </div>
            </label>

            {/* Submit */}
            <div className="flex justify-end pt-4 border-t border-[var(--border)]">
              <Button
                onClick={handleSubmit}
                isLoading={submitting}
                leftIcon={!submitting ? <Send size={16} /> : undefined}
                disabled={!selectedPrefix || selectedEmails.size === 0 || !deadlineTime}
              >
                Schedule Interview{selectedEmails.size > 1 ? `s (${selectedEmails.size})` : ''}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}