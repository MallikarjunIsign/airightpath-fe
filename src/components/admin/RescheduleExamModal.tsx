import { useState } from 'react';
import { CalendarClock, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { useToast } from '@/components/ui/Toast';
import { assessmentService } from '@/services/assessment.service';
import { nowDateTimeLocal, isPast } from '@/utils/datetime.utils';
import type { Assessment } from '@/types/assessment.types';

/**
 * Moves the exam window of a paper the candidate has not sat yet.
 *
 * Only a pending paper can move. Once it has been sat, the window it was sat
 * under is part of the record — changing it cannot give the candidate more time
 * and would leave the result describing a sitting that never happened.
 *
 * The candidate is emailed the new window as part of saving. They were told the
 * old one, so a silent move leaves them turning up to an exam that has gone.
 */
interface RescheduleExamModalProps {
  assessment: Assessment;
  onClose: () => void;
  /** Called after a successful save, so the caller can re-read the record. */
  onSaved: () => void;
}

/** A stored timestamp as the picker's `YYYY-MM-DDTHH:mm`, or '' if unusable. */
function toPickerValue(stamp?: string | null): string {
  if (!stamp) return '';
  // The server writes these bare — `2026-08-23T11:10:00` — which is already the
  // picker's own shape once the seconds are dropped. Anything else is left to
  // the picker to reject rather than guessed at.
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(stamp);
  return match ? `${match[1]}T${match[2]}` : '';
}

export function RescheduleExamModal({
  assessment,
  onClose,
  onSaved,
}: Readonly<RescheduleExamModalProps>) {
  const { showToast } = useToast();
  const [start, setStart] = useState(toPickerValue(assessment.startTime));
  const [deadline, setDeadline] = useState(toPickerValue(assessment.deadline));
  const [saving, setSaving] = useState(false);

  const moduleLabel = assessment.assessmentType === 'APTITUDE' ? 'Aptitude' : 'Coding';

  // Checked as the admin types so the reason a save is blocked is on screen
  // before they press the button, not after.
  let problem: string | null = null;
  if (!start || !deadline) {
    problem = 'Both the opening and closing moments are needed.';
  } else if (start >= deadline) {
    problem = 'The window has to open before it closes.';
  } else if (isPast(deadline)) {
    problem = 'That closing time has already passed, so the candidate could never sit it.';
  }

  async function handleSave() {
    if (problem) {
      showToast(problem, 'warning');
      return;
    }
    setSaving(true);
    try {
      await assessmentService.reschedule(assessment.id, { startTime: start, deadline });
      showToast(`${moduleLabel} exam window updated — the candidate has been emailed.`, 'success');
      onSaved();
      onClose();
    } catch {
      // Error toast auto-handled by the interceptor
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Move the ${moduleLabel.toLowerCase()} exam window`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon={<CalendarClock size={16} />}
            isLoading={saving}
            disabled={!!problem}
            onClick={handleSave}
          >
            Save and notify
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--textSecondary)]">
          {assessment.candidateEmail} has not sat this paper yet. Moving the window changes when
          they can open it.
        </p>

        <DateTimeInput
          label="Window opens"
          value={start}
          onChange={setStart}
          min={nowDateTimeLocal()}
        />
        <DateTimeInput
          label="Window closes"
          value={deadline}
          onChange={setDeadline}
          min={start || nowDateTimeLocal()}
        />

        {problem && <p className="text-sm text-[var(--error)]">{problem}</p>}

        <p className="flex items-start gap-2 text-xs text-[var(--textTertiary)]">
          <Mail size={14} className="mt-0.5 flex-shrink-0" />
          Saving emails the candidate their exam link with the new window.
        </p>
      </div>
    </Modal>
  );
}
