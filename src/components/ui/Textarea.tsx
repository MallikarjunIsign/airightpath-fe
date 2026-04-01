import { TextareaHTMLAttributes, forwardRef, useState } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  maxLength?: number;
  showCharCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, maxLength, showCharCount = false, className = '', onChange, ...props }, ref) => {
    const [charCount, setCharCount] = useState(0);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCharCount(e.target.value.length);
      onChange?.(e);
    };

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          maxLength={maxLength}
          onChange={handleChange}
          className={`
            w-full px-4 py-3 rounded-xl resize-y min-h-[100px]
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
