import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = `
    group inline-flex items-center justify-center font-medium
    transition-all duration-200
    rounded-xl
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]
    active:scale-[0.97]
  `;

  const variants = {
    primary: `
      gradient-button text-white
      shadow-[0_1px_3px_rgba(99,102,241,0.3),0_1px_2px_rgba(0,0,0,0.1)]
      hover:shadow-[0_4px_16px_rgba(99,102,241,0.35),0_2px_4px_rgba(0,0,0,0.1)]
      hover:brightness-110
      focus-visible:ring-[var(--primary)]
    `,
    secondary: `
      bg-[var(--bgElevated,var(--surface2))]
      text-[var(--text)]
      border border-[var(--borderMuted,var(--border))]
      hover:bg-[var(--bgOverlay,var(--surface3))]
      hover:border-[var(--borderHover,var(--border))]
      focus-visible:ring-[var(--primary)]
    `,
    outline: `
      border border-[var(--border)]
      text-[var(--text)]
      bg-transparent
      hover:bg-[var(--bgSubtle,var(--surface1))]
      hover:border-[var(--primary)]
      focus-visible:ring-[var(--primary)]
    `,
    ghost: `
      text-[var(--textSecondary)]
      bg-transparent
      hover:bg-[var(--bgSubtle,var(--surface1))]
      hover:text-[var(--text)]
      focus-visible:ring-[var(--primary)]
    `,
    danger: `
      bg-[var(--error)]
      text-white
      shadow-[0_1px_3px_rgba(239,68,68,0.3),0_1px_2px_rgba(0,0,0,0.1)]
      hover:shadow-[0_4px_16px_rgba(239,68,68,0.3),0_2px_4px_rgba(0,0,0,0.1)]
      hover:brightness-110
      focus-visible:ring-[var(--error)]
    `,
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5 h-9',
    md: 'px-4 py-2.5 text-sm gap-2 h-11',
    lg: 'px-6 py-3 text-base gap-2 h-12',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && (
            <span className="flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
