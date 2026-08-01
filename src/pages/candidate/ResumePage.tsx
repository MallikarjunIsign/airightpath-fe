import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Eye, Loader2, X, Download, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { resumeService } from '@/services/resume.service';
import { jobService } from '@/services/job.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { validateResumeFile } from '@/utils/file.utils';
import { MESSAGES } from '@/config/messages';
import axios from 'axios';
import type { JobPostDTO } from '@/types/job.types';

export function ResumePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  // Resume preview (object URL for the fetched blob).
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  // Revoke the object URL when the preview closes / on unmount.
  useEffect(() => {
    return () => {
      if (resumeUrl) URL.revokeObjectURL(resumeUrl);
    };
  }, [resumeUrl]);

  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      try {
        const res = await jobService.getAllJobs();
        setJobs(res.data ?? []);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, [showToast]);

  const jobOptions = [
    { value: '', label: 'Select a job' },
    ...jobs.map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobPrefix})` })),
  ];

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const error = validateResumeFile(selectedFile);
      if (error) {
        showToast(error, 'error');
        return;
      }
      setFile(selectedFile);
    },
    [showToast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  // A candidate has a single resume, stored per-user (by email). Saving always
  // uses the email-based endpoint, so it works the same whether it's the first
  // upload or a replacement — no per-job application lookup, which is what made
  // the old Upload button 404 with "you haven't applied to this job yet".
  const handleSave = async () => {
    if (!file) {
      showToast(MESSAGES.resume.selectFile, 'warning');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (user?.email) formData.append('email', user.email);
      await resumeService.update(formData, { _skipErrorToast: true });
      showToast(MESSAGES.resume.saved, 'success');
      setFile(null);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      showToast(
        status === 404 ? MESSAGES.resume.noneFound : MESSAGES.resume.actionFailed,
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleView = async () => {
    if (!user?.email) return;
    setViewing(true);
    try {
      const res = await resumeService.view(user.email, { _skipErrorToast: true });
      // Open in an in-page modal instead of window.open(): a popup opened after
      // an await loses the user-gesture context and is blocked by the browser.
      setResumeUrl(URL.createObjectURL(res.data));
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      showToast(
        status === 404 || status === 400 ? MESSAGES.resume.noneFound : MESSAGES.resume.actionFailed,
        'error',
      );
    } finally {
      setViewing(false);
    }
  };

  const closeResume = () => {
    setResumeUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const downloadResume = () => {
    if (!resumeUrl) return;
    const a = document.createElement('a');
    a.href = resumeUrl;
    a.download = `${user?.email ?? 'resume'}-resume`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-[var(--text)]">Resume Management</h1>

      {/* Job Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Job</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            label="Job Position"
            options={jobOptions}
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Resume</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Drag and Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer
              ${
                dragActive
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] hover:border-[var(--primary)]'
              }
            `}
            onClick={() => document.getElementById('resume-file-input')?.click()}
          >
            <input
              id="resume-file-input"
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            <Upload className="w-10 h-10 mx-auto text-[var(--textTertiary)] mb-3" />
            <p className="text-[var(--text)] font-medium">
              Drag and drop your resume here, or click to browse
            </p>
            <p className="text-sm text-[var(--textSecondary)] mt-1">
              Supported formats: PDF, DOC, DOCX (Max 2MB)
            </p>
          </div>

          {/* Selected File */}
          {file && (
            <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-[var(--primary)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">{file.name}</p>
                  <p className="text-xs text-[var(--textSecondary)]">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              onClick={handleSave}
              isLoading={saving}
              disabled={!file}
              leftIcon={<Upload size={18} />}
            >
              Save Resume
            </Button>
            <Button
              variant="secondary"
              onClick={handleView}
              isLoading={viewing}
              leftIcon={<Eye size={18} />}
            >
              View Existing Resume
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resume preview */}
      {resumeUrl && (
        <Modal
          isOpen={!!resumeUrl}
          onClose={closeResume}
          title="Your Resume"
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={closeResume}>
                Close
              </Button>
              <Button
                variant="outline"
                leftIcon={<ExternalLink size={16} />}
                onClick={() => window.open(resumeUrl, '_blank', 'noopener,noreferrer')}
              >
                Open in new tab
              </Button>
              <Button leftIcon={<Download size={16} />} onClick={downloadResume}>
                Download
              </Button>
            </>
          }
        >
          <iframe
            src={resumeUrl}
            title="Resume"
            className="w-full h-[70vh] rounded-lg border border-[var(--border)]"
          />
        </Modal>
      )}
    </div>
  );
}
