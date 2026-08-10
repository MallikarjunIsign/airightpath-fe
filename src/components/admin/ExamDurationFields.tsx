import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { APP_CONFIG } from '@/config/app.config';
import { effectiveQuestionCount, formatDurationLabel } from '@/utils/exam-duration.utils';

/**
 * How long a paper gets, expressed the way recruiters actually think about it:
 * time per question, not total minutes.
 *
 * The total is derived and read-only — a paper that grows by five questions
 * grows the exam by five allowances on its own, so nobody has to remember to
 * update a duration somewhere else. The question count comes from the paper
 * when we can read it (generated papers are JSON) and is typed in when we
 * can't (a PDF or Word upload), purely so the admin sees the resulting total.
 */

interface ExamDurationFieldsProps {
  type: 'APTITUDE' | 'CODING';
  minutesPerQuestion: number;
  onMinutesPerQuestionChange: (minutes: number) => void;
  /** Counted from the uploaded paper; null when the file could not be read. */
  detectedCount: number | null;
  /** Admin-entered count, used only when detection failed. */
  manualCount: string;
  onManualCountChange: (value: string) => void;
  disabled?: boolean;
}

export function ExamDurationFields({
  type,
  minutesPerQuestion,
  onMinutesPerQuestionChange,
  detectedCount,
  manualCount,
  onManualCountChange,
  disabled = false,
}: Readonly<ExamDurationFieldsProps>) {
  const count = effectiveQuestionCount(detectedCount, manualCount);
  const total = count ? count * minutesPerQuestion : null;
  const unit = type === 'CODING' ? 'problem' : 'question';

  return (
    <div className="rounded-lg bg-[var(--surface1)] p-3 space-y-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--textSecondary)]">
        <Clock size={14} />
        Time allowed
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label={`Minutes per ${unit}`}
          type="number"
          min={APP_CONFIG.EXAM_MIN_MINUTES_PER_QUESTION}
          max={APP_CONFIG.EXAM_MAX_MINUTES_PER_QUESTION}
          value={String(minutesPerQuestion)}
          disabled={disabled}
          onChange={(e) => onMinutesPerQuestionChange(Number(e.target.value))}
        />

        {detectedCount ? (
          <div className="flex flex-col justify-end pb-1">
            <span className="text-xs text-[var(--textSecondary)]">Questions in this paper</span>
            <span className="text-sm font-semibold text-[var(--text)]">{detectedCount}</span>
          </div>
        ) : (
          <Input
            label="Number of questions"
            type="number"
            min={1}
            placeholder="e.g. 20"
            value={manualCount}
            disabled={disabled}
            helperText="We couldn't read this from the file"
            onChange={(e) => onManualCountChange(e.target.value)}
          />
        )}
      </div>

      <p className="text-sm text-[var(--text)]">
        {total ? (
          <>
            Total exam time:{' '}
            <span className="font-semibold text-[var(--primary)]">
              {formatDurationLabel(total)}
            </span>{' '}
            <span className="text-[var(--textSecondary)]">
              ({count} × {minutesPerQuestion} min)
            </span>
          </>
        ) : (
          <span className="text-[var(--textSecondary)]">
            Add the question count to see the total exam time. Candidates are timed at{' '}
            {minutesPerQuestion} min per {unit} either way.
          </span>
        )}
      </p>
    </div>
  );
}
