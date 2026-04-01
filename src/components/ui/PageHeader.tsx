import { HTMLAttributes, ReactNode } from 'react';
import { Breadcrumb } from './Breadcrumb';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  onNavigate?: (href: string) => void;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  onNavigate,
  className = '',
  ...props
}: PageHeaderProps) {
  return (
    <div className={`mb-8 ${className}`} {...props}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          items={breadcrumbs}
          onNavigate={onNavigate}
          className="mb-4"
        />
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] font-heading">{title}</h1>
          {description && (
            <p className="text-sm text-[var(--textSecondary)] mt-1.5 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
