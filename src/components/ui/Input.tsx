import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-2">
            {label}
          </label>
        )}
        <div className="relative group">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--textTertiary)] transition-colors duration-200 group-focus-within:text-[var(--primary)]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-2.5 h-11 rounded-xl
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
              ${leftIcon ? 'pl-11' : ''}
              ${rightIcon ? 'pr-11' : ''}
              ${error
                ? 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/15 focus:shadow-[0_0_0_4px_var(--error)]/[0.06]'
                : ''
              }
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--textTertiary)]">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--error)] flex items-center gap-1">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
