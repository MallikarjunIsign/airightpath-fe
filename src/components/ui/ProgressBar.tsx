import { HTMLAttributes } from 'react';

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'primary',
  showLabel = false,
  label,
  className = '',
  ...props
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const variants = {
    primary: 'gradient-brand',
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    error: 'bg-[var(--error)]',
  };

  const glowColors = {
    primary: 'shadow-[0_0_8px_rgba(99,102,241,0.4)]',
    success: 'shadow-[0_0_8px_rgba(34,197,94,0.3)]',
    warning: 'shadow-[0_0_8px_rgba(245,158,11,0.3)]',
    error: 'shadow-[0_0_8px_rgba(239,68,68,0.3)]',
  };

  return (
    <div className={`w-full ${className}`} {...props}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <span className="text-sm font-medium text-[var(--text)]">{label}</span>
          )}
          {showLabel && (
            <span className="text-sm font-medium text-[var(--textSecondary)] tabular-nums">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`
          w-full bg-[var(--bgOverlay,var(--surface2))] rounded-full overflow-hidden
          ${sizes[size]}
        `}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`
            ${sizes[size]} rounded-full
            transition-all duration-500 ease-out
            ${variants[variant]}
            ${percentage > 0 ? glowColors[variant] : ''}
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
