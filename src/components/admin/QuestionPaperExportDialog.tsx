import { useState } from 'react';
import { FileJson, FileText, FileDown, Printer, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  parseQuestionPaper,
  questionPaperToHtml,
  downloadBlob,
  downloadAsWord,
  downloadAsPdf,
  printHtmlInWindow,
  withExtension,
} from '@/utils/question-paper.utils';

export type PaperFormat = 'json' | 'pdf' | 'word' | 'print';

const FORMATS: {
  id: PaperFormat;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'pdf',
    label: 'PDF',
    hint: 'Downloads a .pdf — ready to share',
    icon: <FileDown size={18} />,
  },
  {
    id: 'word',
    label: 'Word',
    hint: 'Downloads a .doc you can edit',
    icon: <FileText size={18} />,
  },
  {
    id: 'json',
    label: 'JSON',
    hint: 'The original file, exactly as generated',
    icon: <FileJson size={18} />,
  },
  {
    id: 'print',
    label: 'Print / preview',
    hint: 'Opens a print view — read it or send it to a printer',
    icon: <Printer size={18} />,
  },
];

/**
 * Asks which format the admin wants a generated question paper in.
 *
 * The paper only exists as JSON, which is unreadable for anyone checking or
 * circulating it — PDF and Word are rendered from the same content here in the
 * browser, so nothing new is asked of the backend.
 */
export function QuestionPaperExportDialog({
  file,
  title,
  onClose,
}: Readonly<{ file: File; title: string; onClose: () => void }>) {
  const { showToast } = useToast();
  const [format, setFormat] = useState<PaperFormat>('pdf');
  const [busy, setBusy] = useState(false);
  const [includeAnswers, setIncludeAnswers] = useState(true);

  async function handleExport() {
    if (busy) return;

    // Opened before the await so the browser still counts it as a click.
    const printWindow = format === 'print' ? window.open('', '_blank') : null;
    setBusy(true);
    try {
      if (format === 'json') {
        downloadBlob(file, withExtension(file.name, 'json'));
        onClose();
        return;
      }

      const paper = parseQuestionPaper(await file.text());

      if (format === 'pdf') {
        await downloadAsPdf(title, paper, withExtension(file.name, 'pdf'), { includeAnswers });
        onClose();
        return;
      }

      const html = questionPaperToHtml(title, paper, { includeAnswers });

      if (format === 'word') {
        downloadAsWord(html, withExtension(file.name, 'doc'));
        onClose();
        return;
      }

      if (!printHtmlInWindow(printWindow, html)) {
        showToast('Allow pop-ups for this site to open the print view.', 'error');
        return;
      }
      onClose();
    } catch {
      printWindow?.close();
      showToast('Could not read the question paper file.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Download question paper"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} isLoading={busy}>
            {format === 'print' ? 'Open print view' : 'Download'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--textSecondary)]">
          <span className="font-medium text-[var(--text)]">{file.name}</span> — choose a format.
        </p>

        <div className="space-y-2">
          {FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFormat(option.id)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                format === option.id
                  ? 'border-[var(--primary)] bg-[var(--primaryMuted,var(--primaryLight))]'
                  : 'border-[var(--border)] hover:border-[var(--borderHover,var(--border))]'
              }`}
            >
              <span className="text-[var(--primary)] mt-0.5 flex-shrink-0">{option.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text)]">{option.label}</span>
                <span className="block text-xs text-[var(--textSecondary)]">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Answer keys are useful internally and must not reach candidates. */}
        {format !== 'json' && (
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={includeAnswers}
              onChange={(e) => setIncludeAnswers(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--inputBorder)] text-[var(--primary)] focus:ring-[var(--inputFocus)]"
            />
            Include the answer key
          </label>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-[var(--textSecondary)]">
            <Loader2 size={12} className="animate-spin" />
            {format === 'print' ? 'Preparing the print view...' : 'Preparing the file...'}
          </p>
        )}
      </div>
    </Modal>
  );
}
