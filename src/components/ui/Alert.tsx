import { HTMLAttributes, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  icon?: ReactNode;
}

export function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  icon,
  className = '',
  ...props
}: AlertProps) {
  const variants = {
    success: {
      container: 'bg-[var(--successMuted,var(--successLight))] border-[var(--success)]/20',
      icon: <CheckCircle size={20} className="text-[var(--success)]" />,
      title: 'text-[var(--success)]',
      text: 'text-[var(--textSecondary)]',
    },
    error: {
      container: 'bg-[var(--errorMuted,var(--errorLight))] border-[var(--error)]/20',
      icon: <XCircle size={20} className="text-[var(--error)]" />,
      title: 'text-[var(--error)]',
      text: 'text-[var(--textSecondary)]',
    },
    warning: {
      container: 'bg-[var(--warningMuted,var(--warningLight))] border-[var(--warning)]/20',
      icon: <AlertTriangle size={20} className="text-[var(--warning)]" />,
      title: 'text-[var(--warning)]',
      text: 'text-[var(--textSecondary)]',
    },
    info: {
      container: 'bg-[var(--infoMuted,var(--infoLight))] border-[var(--info)]/20',
      icon: <Info size={20} className="text-[var(--info)]" />,
      title: 'text-[var(--info)]',
      text: 'text-[var(--textSecondary)]',
    },
  };

  const config = variants[variant];

  return (
    <div
      role="alert"
      className={`
        flex gap-3 p-4 rounded-xl border
        ${config.container}
        ${className}
      `}
      {...props}
    >
      <div className="flex-shrink-0 mt-0.5">
        {icon || config.icon}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={`text-sm font-semibold mb-1 ${config.title}`}>{title}</p>
        )}
        <div className={`text-sm ${config.text}`}>{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-[var(--textTertiary)] hover:text-[var(--text)] p-0.5 rounded-lg hover:bg-[var(--bgOverlay,var(--surface1))] transition-all duration-150"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
