import { Input } from '@/components/ui/Input';

/**
 * A date-and-time field that can only be filled from the picker.
 *
 * Typed characters and pastes are dropped, so a value cannot be keyed in past
 * the `min` the picker enforces — someone typing "2020-01-01" into a field
 * floored at today was the hole this closes.
 *
 * Deliberately NOT the `readonly` attribute. `readonly` blocks every user
 * modification, and the picker writing back is a user modification: the field
 * becomes impossible to fill, and Chrome hides the calendar indicator outright.
 * Blocking the keystrokes gets the intent without disabling the control.
 *
 * Arrow keys, Tab, Backspace and Delete still work. A keyboard-only user has no
 * other way to set or clear this field, and taking those away would leave them
 * unable to use the form at all. They can still land on an invalid moment, which
 * is why `min` is never the only guard — every caller also renders an error and
 * re-checks on submit.
 */

/** Keys that navigate or adjust rather than type a value into a segment. */
const NAVIGATION_KEYS = new Set([
  'Tab',
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete',
]);

interface DateTimeInputProps {
  label: string;
  /** `YYYY-MM-DDTHH:mm`, or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable moment, as `YYYY-MM-DDTHH:mm`. */
  min?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export function DateTimeInput({
  label,
  value,
  onChange,
  min,
  required,
  disabled,
  helperText,
  error,
  leftIcon,
}: Readonly<DateTimeInputProps>) {
  return (
    <Input
      label={label}
      type="datetime-local"
      value={value}
      min={min}
      required={required}
      disabled={disabled}
      helperText={helperText}
      error={error}
      leftIcon={leftIcon}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(event) => {
        // Let shortcuts through — Ctrl/Cmd combinations are not value entry.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (NAVIGATION_KEYS.has(event.key)) return;
        event.preventDefault();
      }}
      onPaste={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    />
  );
}
