import { Target } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { DEFAULT_PASS_PERCENTAGE } from '@/utils/result.utils';

/**
 * The mark a paper must reach to pass, set per assessment at assign time.
 *
 * Deliberately its own block rather than part of "Time allowed": it is the only
 * setting on this screen that decides an outcome rather than the conditions of
 * the attempt, and burying it beside the clock is how a paper ends up graded to
 * a standard nobody chose.
 *
 * It is stored on the assessment, so changing it for a later round cannot
 * re-grade papers that have already been sat.
 */

interface PassMarkFieldProps {
  type: 'APTITUDE' | 'CODING';
  /** Raw input text — kept as a string so the field can be cleared while typing. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PassMarkField({ type, value, onChange, disabled = false }: Readonly<PassMarkFieldProps>) {
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 100;
  const label = type === 'CODING' ? 'coding paper' : 'aptitude paper';

  return (
    <div className="rounded-lg bg-[var(--surface1)] p-3 space-y-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--textSecondary)]">
        <Target size={14} />
        Pass mark
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Pass percentage"
          type="number"
          min={1}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          // Warned rather than blocked: the value falls back to the default on
          // submit, so a half-typed field must not hold up the assignment.
          error={value.trim() !== '' && !valid ? 'Enter a whole number between 1 and 100' : undefined}
        />
        <div className="flex flex-col justify-end pb-1">
          <span className="text-xs text-[var(--textSecondary)]">Applied to</span>
          <span className="text-sm font-semibold text-[var(--text)]">This {label} only</span>
        </div>
      </div>

      <p className="text-sm text-[var(--textSecondary)]">
        {valid ? (
          <>
            Candidates scoring{' '}
            <span className="font-semibold text-[var(--primary)]">{parsed}% or above</span> pass this
            paper.
          </>
        ) : (
          <>Leave blank to use the default of {DEFAULT_PASS_PERCENTAGE}%.</>
        )}
      </p>
    </div>
  );
}
