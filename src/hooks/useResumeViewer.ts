import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '@/components/ui/Toast';
import { resumeService } from '@/services/resume.service';
import { filenameFromContentDisposition, resumeExtensionForType } from '@/utils/file.utils';
import { MESSAGES } from '@/config/messages';

/**
 * Fetches a candidate's resume on demand and holds it as a blob URL.
 *
 * The blob is the whole file, so it backs both the preview and the download —
 * one request, no second round trip when the reviewer decides to keep a copy.
 * Pair with `<ResumeViewerModal>` to show it.
 */

export interface ResumeView {
  url: string;
  name: string;
  /** Blob MIME type — decides whether an inline preview is worth showing. */
  type: string;
}

export function useResumeViewer() {
  const { showToast } = useToast();
  const [resume, setResume] = useState<ResumeView | null>(null);
  const [loading, setLoading] = useState(false);

  // One place revokes the blob URL: when the viewer closes, and on unmount.
  useEffect(() => {
    return () => {
      if (resume) URL.revokeObjectURL(resume.url);
    };
  }, [resume]);

  const open = useCallback(
    async (email?: string, preferredName?: string) => {
      if (!email || loading) return;
      setLoading(true);
      try {
        const res = await resumeService.view(email, { _skipErrorToast: true });
        const blob = res.data;
        // An empty body is the shape "no resume on file" arrives in.
        if (!blob || blob.size === 0) {
          showToast(MESSAGES.admin.resume.unavailable, 'error');
          return;
        }
        const headers = res.headers as Record<string, string> | undefined;
        const name =
          preferredName ||
          filenameFromContentDisposition(headers?.['content-disposition']) ||
          `${email}-resume${resumeExtensionForType(blob.type)}`;
        setResume({ url: URL.createObjectURL(blob), name, type: blob.type });
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        showToast(
          status === 400 || status === 404
            ? MESSAGES.admin.resume.unavailable
            : MESSAGES.admin.resume.openFailed,
          'error',
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, showToast],
  );

  // Setting null triggers the effect cleanup above, which revokes the URL.
  const close = useCallback(() => setResume(null), []);

  return { resume, loading, open, close };
}

/** Saves an already-fetched resume to disk — no second request. */
export function downloadResumeFile(resume: ResumeView) {
  const a = document.createElement('a');
  a.href = resume.url;
  a.download = resume.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
