import { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in-up">
      {icon && (
        <div
          className="
            w-16 h-16 rounded-2xl
            gradient-brand
            flex items-center justify-center text-white
            mb-5
            shadow-[0_4px_16px_rgba(99,102,241,0.25)]
          "
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--text)] mb-2 font-heading">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--textSecondary)] mb-6 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
