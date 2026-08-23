import { Download, ExternalLink, FileText } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { downloadResumeFile } from '@/hooks/useResumeViewer';
import type { ResumeView } from '@/hooks/useResumeViewer';

/**
 * Shows the resume `useResumeViewer` fetched, with the same three exits every
 * document viewer on this screen offers: close, open in a tab, download.
 */
export function ResumeViewerModal({
  resume,
  onClose,
}: Readonly<{ resume: ResumeView; onClose: () => void }>) {
  // Browsers render PDFs in an iframe; Word downloads instead of previewing,
  // so say so rather than showing an empty frame.
  const canPreview = !resume.type || resume.type.includes('pdf');

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={resume.name}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            leftIcon={<ExternalLink size={16} />}
            onClick={() => window.open(resume.url, '_blank', 'noopener,noreferrer')}
          >
            Open in New Tab
          </Button>
          <Button leftIcon={<Download size={16} />} onClick={() => downloadResumeFile(resume)}>
            Download
          </Button>
        </>
      }
    >
      {canPreview ? (
        <iframe
          src={resume.url}
          title="Resume"
          className="w-full h-[70vh] rounded-lg border border-[var(--border)] bg-white"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 h-[40vh] rounded-lg border border-dashed border-[var(--border)] text-center px-6">
          <FileText size={36} className="text-[var(--textSecondary)]" />
          <p className="text-sm text-[var(--textSecondary)]">
            This resume is a Word document, which the browser can&apos;t preview. Download it to
            open in Word.
          </p>
          <Button
            size="sm"
            leftIcon={<Download size={15} />}
            onClick={() => downloadResumeFile(resume)}
          >
            Download resume
          </Button>
        </div>
      )}
    </Modal>
  );
}
