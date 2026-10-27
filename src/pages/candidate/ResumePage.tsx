import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  FileText,
  Eye,
  Loader2,
  X,
  Download,
  ExternalLink,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { resumeService } from '@/services/resume.service';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  validateResumeFile,
  filenameFromContentDisposition,
  resumeExtensionForType,
} from '@/utils/file.utils';
import { formatFileSize } from '@/utils/format.utils';
import { MESSAGES } from '@/config/messages';

/**
 * The candidate's single resume.
 *
 * Resumes are stored per candidate (by email), not per job — the old job
 * dropdown here implied otherwise and did nothing. This screen shows the one
 * resume on file and lets it be replaced; which resume went with which
 * application is answered on the Applications screen.
 */
export function ResumePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  /** The resume currently on file, or null when there is none. */
  const [stored, setStored] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  /** The upload box is hidden behind "Change" once a resume is on file. */
  const [showUpload, setShowUpload] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  /** Object URL for the preview modal. */
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  const loadStored = useCallback(async () => {
    const email = user?.email;
    if (!email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await resumeService.view(email, { _skipErrorToast: true });
      const blob = res.data;
      if (!blob || blob.size === 0) {
        setStored(null);
        return;
      }
      const headers = res.headers as Record<string, string> | undefined;
      const name =
        filenameFromContentDisposition(headers?.['content-disposition']) ??
        `${email}-resume${resumeExtensionForType(blob.type)}`;
      setStored(new File([blob], name, { type: blob.type || 'application/pdf' }));
    } catch {
      // 400/404 simply means nothing has been uploaded yet.
      setStored(null);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  // Revoke the object URL when the preview closes / on unmount.
  useEffect(() => {
    return () => {
      if (resumeUrl) URL.revokeObjectURL(resumeUrl);
    };
  }, [resumeUrl]);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const error = validateResumeFile(selectedFile);
      if (error) {
        showToast(error, 'error');
        return;
      }
      setFile(selectedFile);
    },
    [showToast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect],
  );

  /** Saving always uses the email-based endpoint — first upload or replacement. */
  async function saveResume() {
    if (!file) return;
    setConfirmReplace(false);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (user?.email) formData.append('email', user.email);
      await resumeService.update(formData, { _skipErrorToast: true });
      showToast(MESSAGES.resume.saved, 'success');
      setFile(null);
      setShowUpload(false);
      await loadStored();
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      showToast(status === 404 ? MESSAGES.resume.noneFound : MESSAGES.resume.actionFailed, 'error');
    } finally {
      setSaving(false);
    }
  }

  /** Replacing what is already on file is worth one question first. */
  function handleSaveClick() {
    if (stored) setConfirmReplace(true);
    else saveResume();
  }

  function openPreview() {
    if (!stored) return;
    setResumeUrl(URL.createObjectURL(stored));
  }

  function closePreview() {
    setResumeUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function downloadStored() {
    if (!stored) return;
    const url = URL.createObjectURL(stored);
    const a = document.createElement('a');
    a.href = url;
    a.download = stored.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">Resume Management</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          One resume, used whenever you apply for a job. Replace it any time.
        </p>
      </div>

      {/* What is on file */}
      {stored ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--successMuted,var(--successLight))]">
                <CheckCircle size={20} className="text-[var(--success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">Your current resume</p>
                <p className="text-sm text-[var(--textSecondary)] break-all">{stored.name}</p>
                <p className="text-xs text-[var(--textTertiary)] mt-0.5">
                  {formatFileSize(stored.size)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" leftIcon={<Eye size={15} />} onClick={openPreview}>
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download size={15} />}
                  onClick={downloadStored}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  leftIcon={<RefreshCw size={15} />}
                  onClick={() => setShowUpload(true)}
                  disabled={showUpload}
                >
                  Change
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText size={44} />}
              title="No resume yet"
              description="Upload one here and it will be ready the next time you apply for a job."
            />
          </CardContent>
        </Card>
      )}

      {/* Upload box — shown straight away only when there is nothing on file;
          otherwise it waits behind "Change". */}
      {(!stored || showUpload) && (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-[var(--text)] mb-3">
            {stored ? 'Replace your resume' : 'Upload your resume'}
          </p>

          <button
            type="button"
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onClick={() => document.getElementById('resume-file-input')?.click()}
            className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
              dragActive
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] hover:border-[var(--primary)]'
            }`}
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
            <span className="block text-[var(--text)] font-medium">
              Drag and drop your resume here, or click to browse
            </span>
            <span className="block text-sm text-[var(--textSecondary)] mt-1">
              PDF, DOC or DOCX — max 2MB
            </span>
          </button>

          {file && (
            <div className="mt-4 flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--textSecondary)]">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors flex-shrink-0"
                aria-label="Remove selected file"
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              onClick={handleSaveClick}
              isLoading={saving}
              disabled={!file}
              leftIcon={stored ? <RefreshCw size={18} /> : <Upload size={18} />}
            >
              {stored ? 'Replace resume' : 'Save resume'}
            </Button>
            {stored && (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowUpload(false);
                  setFile(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>

          {stored && (
            <p className="text-xs text-[var(--textSecondary)] mt-3">
              Applications you have already submitted keep the resume you sent with them.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Replacing overwrites the stored file, so confirm it once. */}
      {confirmReplace && file && (
        <ConfirmDialog
          isOpen
          variant="warning"
          title="Replace your resume?"
          confirmText="Replace"
          isLoading={saving}
          onClose={() => setConfirmReplace(false)}
          onConfirm={saveResume}
          message={
            <span>
              <strong className="text-[var(--text)]">{file.name}</strong> will replace{' '}
              <strong className="text-[var(--text)]">{stored?.name}</strong>. New applications will
              use the new file.
            </span>
          }
        />
      )}

      {/* Preview */}
      {resumeUrl && (
        <Modal
          isOpen={!!resumeUrl}
          onClose={closePreview}
          title="Your Resume"
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={closePreview}>
                Close
              </Button>
              <Button
                variant="outline"
                leftIcon={<ExternalLink size={16} />}
                onClick={() => window.open(resumeUrl, '_blank', 'noopener,noreferrer')}
              >
                Open in new tab
              </Button>
              <Button leftIcon={<Download size={16} />} onClick={downloadStored}>
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
