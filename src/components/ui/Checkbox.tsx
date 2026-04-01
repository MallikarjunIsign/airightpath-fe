import { InputHTMLAttributes, forwardRef } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', ...props }, ref) => {
    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            className="peer absolute w-5 h-5 opacity-0 cursor-pointer"
            {...props}
          />
          <div
            className={`
              w-5 h-5 rounded-md
              border-2 border-[var(--inputBorder)]
              bg-[var(--inputBg)]
              peer-checked:bg-[var(--primary)]
              peer-checked:border-[var(--primary)]
              peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--inputFocus)]/30
              peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--background)]
              peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
              transition-all duration-200
              flex items-center justify-center
              group-hover:border-[var(--primary)]/50
              ${className}
            `}
          >
            <Check
              size={14}
              className="text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-150"
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex-1 select-none">
            {label && (
              <span className="block text-sm font-medium text-[var(--text)]">
                {label}
              </span>
            )}
            {description && (
              <p className="text-sm text-[var(--textSecondary)] mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
