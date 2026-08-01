import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { DateTimeField } from '@/components/ui/DateTimeField';

interface BulkActionModalProps {
  title: string;
  hasDateTime: boolean;
  dateTimeRequired: boolean;
  recipientCount: number;
  sending: boolean;
  dateTime: string;
  onDateTimeChange: (value: string) => void;
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
  content,
  onContentChange,
  onClose,
  onSend,
}: Readonly<BulkActionModalProps>) {
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
          <Button onClick={onSend} isLoading={sending}>
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
          <DateTimeField
            label="Date & Time"
            value={dateTime}
            onChange={onDateTimeChange}
            required={dateTimeRequired}
          />
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
