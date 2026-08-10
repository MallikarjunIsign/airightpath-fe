import { useState } from 'react';
import { FileJson, FileText, FileDown, Printer, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  answerSheetToHtml,
  answerSheetToJson,
  answerSheetFileName,
  buildAnswerSheetPdf,
} from '@/utils/answer-sheet.utils';
import { downloadBlob, downloadAsWord, printHtmlInWindow } from '@/utils/question-paper.utils';
import type { AnswerSheetData } from '@/utils/answer-sheet.utils';

/**
 * Downloads the candidate's answer sheet — every question with what they
 * actually wrote — in whichever format the reviewer needs.
 *
 * Deliberately the same four options as the question-paper dialog, so the two
 * downloads on this screen behave the same way.
 */

type SheetFormat = 'pdf' | 'word' | 'json' | 'print';

const FORMATS: { id: SheetFormat; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Downloads a .pdf — ready to share', icon: <FileDown size={18} /> },
  { id: 'word', label: 'Word', hint: 'Downloads a .doc you can annotate', icon: <FileText size={18} /> },
  {
    id: 'json',
    label: 'JSON',
    hint: 'Structured data — answers, code and test results',
    icon: <FileJson size={18} />,
  },
  {
    id: 'print',
    label: 'Print / preview',
    hint: 'Opens a print view before you commit to a file',
    icon: <Printer size={18} />,
  },
];

export function AnswerSheetExportDialog({
  data,
  onClose,
}: Readonly<{ data: AnswerSheetData; onClose: () => void }>) {
  const { showToast } = useToast();
  const [format, setFormat] = useState<SheetFormat>('pdf');
  const [busy, setBusy] = useState(false);

  const stem = answerSheetFileName(data);
  const questionCount =
    (data.aptitude?.answers.length ?? 0) + (data.coding?.rows.length ?? 0);

  async function handleExport() {
    if (busy) return;

    // Opened before the await so the browser still counts it as a click.
    const printWindow = format === 'print' ? window.open('', '_blank') : null;
    setBusy(true);
    try {
      if (format === 'json') {
        downloadBlob(
          new Blob([answerSheetToJson(data)], { type: 'application/json' }),
          `${stem}.json`
        );
        onClose();
        return;
      }

      if (format === 'pdf') {
        const doc = await buildAnswerSheetPdf(data);
        doc.save(`${stem}.pdf`);
        onClose();
        return;
      }

      const html = answerSheetToHtml(data);

      if (format === 'word') {
        downloadAsWord(html, `${stem}.doc`);
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
      showToast('Could not build the answer sheet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Download answer sheet"
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
          <span className="font-medium text-[var(--text)]">{data.candidateEmail}</span> —{' '}
          {questionCount} question{questionCount === 1 ? '' : 's'} with the answers they gave,
          including the code they submitted.
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
