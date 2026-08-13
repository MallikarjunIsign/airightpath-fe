import { TextareaHTMLAttributes, forwardRef, useState } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  maxLength?: number;
  showCharCount?: boolean;
  /** Allow the user to drag-resize the textarea. Defaults to true. */
  resizable?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, maxLength, showCharCount = false, resizable = true, required, className = '', onChange, ...props }, ref) => {
    const [typedCount, setTypedCount] = useState(0);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTypedCount(e.target.value.length);
      onChange?.(e);
    };

    // A controlled textarea already knows how long its text is. Counting only
    // keystrokes showed "0/10000" under a field holding a freshly loaded
    // prompt, and reverted to that count every time the value changed from
    // outside — switching tabs, say. The local count is the fallback for the
    // uncontrolled case.
    const charCount = typeof props.value === 'string' ? props.value.length : typedCount;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            {label}
            {required && <span className="text-[var(--error)] ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          maxLength={maxLength}
          aria-required={required}
          aria-invalid={!!error}
          onChange={handleChange}
          className={`
            w-full px-4 py-3 rounded-xl min-h-[100px]
            ${resizable ? 'resize-y' : 'resize-none'}
            bg-[var(--inputBg)]
            border border-[var(--inputBorder)]
            text-[var(--text)]
            placeholder:text-[var(--textTertiary)]
            focus:outline-none
            focus:border-[var(--inputFocus)]
            focus:ring-2 focus:ring-[var(--inputFocus)]/15
            focus:shadow-[0_0_0_4px_var(--inputFocus)]/[0.06]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            ${error
              ? 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/15 focus:shadow-[0_0_0_4px_var(--error)]/[0.06]'
              : ''
            }
            ${className}
          `}
          {...props}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div>
            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}
            {helperText && !error && (
              <p className="text-sm text-[var(--textSecondary)]">{helperText}</p>
            )}
          </div>
          {showCharCount && (
            <p
              className={`
                text-xs tabular-nums
                ${maxLength && charCount >= maxLength
                  ? 'text-[var(--error)]'
                  : 'text-[var(--textTertiary)]'
                }
              `}
            >
              {charCount}{maxLength ? `/${maxLength}` : ''}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
