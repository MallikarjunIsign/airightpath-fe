import { ReactNode } from 'react';
import { FieldError } from 'react-hook-form';

interface FormFieldProps {
  label?: string;
  error?: FieldError | string;
  helperText?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function FormField({
  label,
  error,
  helperText,
  required = false,
  children,
  className = '',
  htmlFor,
}: FormFieldProps) {
  const errorMessage = typeof error === 'string' ? error : error?.message;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-[var(--text)] mb-2"
        >
          {label}
          {required && (
            <span className="text-[var(--error)] ml-0.5">*</span>
          )}
        </label>
      )}
      {children}
      {errorMessage && (
        <p className="mt-1.5 text-sm text-[var(--error)]">{errorMessage}</p>
      )}
      {helperText && !errorMessage && (
        <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>
      )}
    </div>
  );
}
