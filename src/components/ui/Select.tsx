import { SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            {label}
          </label>
        )}
        <div className="relative group">
          <select
            ref={ref}
            className={`
              w-full px-4 py-2.5 h-11 rounded-xl appearance-none
              bg-[var(--inputBg)]
              border border-[var(--inputBorder)]
              text-[var(--text)]
              focus:outline-none
              focus:border-[var(--inputFocus)]
              focus:ring-2 focus:ring-[var(--inputFocus)]/15
              focus:shadow-[0_0_0_4px_var(--inputFocus)]/[0.06]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
              pr-10
              ${error
                ? 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/15 focus:shadow-[0_0_0_4px_var(--error)]/[0.06]'
                : ''
              }
              ${className}
            `}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--textTertiary)] pointer-events-none transition-colors duration-200 group-focus-within:text-[var(--primary)]">
            <ChevronDown size={16} />
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--error)]">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
