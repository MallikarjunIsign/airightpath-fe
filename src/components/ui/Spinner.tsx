import { HTMLAttributes } from 'react';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  label?: string;
}

export function Spinner({
  size = 'md',
  color,
  label,
  className = '',
  ...props
}: SpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <div
      className={`inline-flex flex-col items-center gap-3 ${className}`}
      role="status"
      aria-label={label || 'Loading'}
      {...props}
    >
      <svg
        className={`animate-spin ${sizes[size]}`}
        style={{ color: color || 'var(--primary)' }}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-80"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && (
        <span className="text-sm text-[var(--textSecondary)]">{label}</span>
      )}
    </div>
  );
}

interface FullPageSpinnerProps {
  label?: string;
}

export function FullPageSpinner({ label = 'Loading...' }: FullPageSpinnerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bgCanvas,var(--background))]/80 backdrop-blur-sm">
      <Spinner size="xl" label={label} />
    </div>
  );
}

interface InlineSpinnerProps {
  label?: string;
}

export function InlineSpinner({ label = 'Loading...' }: InlineSpinnerProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" label={label} />
    </div>
  );
}
