import { HTMLAttributes, ReactNode } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
  ...props
}: BadgeProps) {
  const variants = {
    default: 'bg-[var(--bgOverlay,var(--surface2))] text-[var(--text)]',
    success: 'bg-[var(--successMuted,var(--successLight))] text-[var(--success)]',
    warning: 'bg-[var(--warningMuted,var(--warningLight))] text-[var(--warning)]',
    error: 'bg-[var(--errorMuted,var(--errorLight))] text-[var(--error)]',
    info: 'bg-[var(--infoMuted,var(--infoLight))] text-[var(--info)]',
    primary: 'bg-[var(--primaryMuted,var(--primaryLight))] text-[var(--primary)]',
    secondary: 'bg-[var(--bgOverlay,var(--surface2))] text-[var(--textSecondary)]',
  };

  const dotColors: Record<string, string> = {
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    error: 'bg-[var(--error)]',
    info: 'bg-[var(--info)]',
    primary: 'bg-[var(--primary)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-1.5',
  };

  return (
    <span
      className={`
        inline-flex items-center justify-center
        font-medium rounded-full
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {dot && dotColors[variant] && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}
