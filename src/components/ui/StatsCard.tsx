import { HTMLAttributes, ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    label?: string;
    direction: 'up' | 'down';
  };
  iconBgClass?: string;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'accent';
}

const variantStyles = {
  primary: {
    iconBg: 'bg-[var(--primaryMuted,var(--primaryLight))] text-[var(--primary)]',
    accent: 'from-[var(--primary)]/5 to-transparent',
  },
  success: {
    iconBg: 'bg-[var(--successMuted,var(--successLight))] text-[var(--success)]',
    accent: 'from-[var(--success)]/5 to-transparent',
  },
  warning: {
    iconBg: 'bg-[var(--warningMuted,var(--warningLight))] text-[var(--warning)]',
    accent: 'from-[var(--warning)]/5 to-transparent',
  },
  error: {
    iconBg: 'bg-[var(--errorMuted,var(--errorLight))] text-[var(--error)]',
    accent: 'from-[var(--error)]/5 to-transparent',
  },
  info: {
    iconBg: 'bg-[var(--infoMuted,var(--infoLight))] text-[var(--info)]',
    accent: 'from-[var(--info)]/5 to-transparent',
  },
  accent: {
    iconBg: 'bg-[var(--accentMuted,var(--accentLight))] text-[var(--accent)]',
    accent: 'from-[var(--accent)]/5 to-transparent',
  },
};

export function StatsCard({
  icon,
  label,
  value,
  trend,
  iconBgClass,
  variant = 'primary',
  className = '',
  ...props
}: StatsCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={`
        relative overflow-hidden
        bg-[var(--cardBg)]
        border border-[var(--borderMuted,var(--cardBorder))]
        rounded-2xl p-6
        transition-all duration-200
        shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
        hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]
        hover:-translate-y-0.5
        ${className}
      `}
      {...props}
    >
      {/* Subtle gradient accent in the corner */}
      <div
        className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${styles.accent} rounded-bl-full pointer-events-none`}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--textSecondary)] mb-1">{label}</p>
          <p className="text-2xl font-bold text-[var(--text)] font-heading tabular-nums">{value}</p>
          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`
                  inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md
                  ${trend.direction === 'up'
                    ? 'text-[var(--success)] bg-[var(--successMuted,var(--successLight))]'
                    : 'text-[var(--error)] bg-[var(--errorMuted,var(--errorLight))]'
                  }
                `}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp size={12} />
                ) : (
                  <TrendingDown size={12} />
                )}
                {trend.value}%
              </span>
              {trend.label && (
                <span className="text-xs text-[var(--textTertiary)]">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
              ${iconBgClass || styles.iconBg}
            `}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
