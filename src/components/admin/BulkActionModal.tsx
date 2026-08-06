import { CalendarClock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { formatScheduleForEmail, isPast } from '@/utils/datetime.utils';

interface BulkActionModalProps {
  title: string;
  hasDateTime: boolean;
  dateTimeRequired: boolean;
  recipientCount: number;
  sending: boolean;
  dateTime: string;
  onDateTimeChange: (value: string) => void;
  /** Earliest selectable moment (`YYYY-MM-DDTHH:mm`) — normally "now". */
  minDateTime?: string;
  content: string;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}

/** Confirmation modal for a bulk email action (ack / rejection / exam link / …). */
export function BulkActionModal({
  title,
  hasDateTime,
  dateTimeRequired,
  recipientCount,
  sending,
  dateTime,
  onDateTimeChange,
  minDateTime,
  content,
  onContentChange,
  onClose,
  onSend,
}: Readonly<BulkActionModalProps>) {
  // The picker blocks past times, but a value can still go stale while the
  // modal sits open — keep the guard on the Send button too.
  const scheduledInPast = !!dateTime && isPast(dateTime);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={onSend} isLoading={sending} disabled={scheduledInPast}>
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--textSecondary)]">
          Sending to <strong>{recipientCount}</strong> candidate
          {recipientCount !== 1 ? 's' : ''}.
        </p>

        {hasDateTime && (
          <div className="space-y-2">
            <DateTimeField
              label="Date & Time"
              value={dateTime}
              onChange={onDateTimeChange}
              min={minDateTime}
              required={dateTimeRequired}
              helperText="Cannot be in the past"
            />

            {/* Show the schedule exactly as the candidate will read it. */}
            {dateTime && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${
                  scheduledInPast
                    ? 'border-[var(--error)] text-[var(--error)]'
                    : 'border-[var(--border)] text-[var(--textSecondary)]'
                }`}
              >
                <CalendarClock size={15} className="flex-shrink-0 mt-0.5" />
                {scheduledInPast ? (
                  <span>That date &amp; time has already passed — pick a future slot.</span>
                ) : (
                  <span>
                    Candidates will see:{' '}
                    <strong className="text-[var(--text)]">
                      {formatScheduleForEmail(dateTime)}
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <Textarea
          label="Message Content (optional)"
          placeholder="Enter custom message content..."
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          maxLength={2000}
          showCharCount
        />
      </div>
    </Modal>
  );
}
