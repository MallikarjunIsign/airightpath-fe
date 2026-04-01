import { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
}

interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  showHome?: boolean;
  onNavigate?: (href: string) => void;
}

export function Breadcrumb({
  items,
  separator,
  showHome = false,
  onNavigate,
  className = '',
  ...props
}: BreadcrumbProps) {
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: 'Home', href: '/', icon: <Home size={14} /> }, ...items]
    : items;

  const handleClick = (e: React.MouseEvent, href?: string) => {
    if (href && onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  return (
    <nav aria-label="Breadcrumb" className={className} {...props}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-[var(--textTertiary)]">
                  {separator || <ChevronRight size={12} />}
                </span>
              )}
              {isLast || !item.href ? (
                <span
                  className={`
                    inline-flex items-center gap-1 text-sm
                    ${isLast
                      ? 'font-medium text-[var(--text)]'
                      : 'text-[var(--textTertiary)]'
                    }
                  `}
                >
                  {item.icon}
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  onClick={(e) => handleClick(e, item.href)}
                  className="
                    inline-flex items-center gap-1 text-sm
                    text-[var(--textSecondary)]
                    hover:text-[var(--primary)]
                    transition-colors duration-150
                  "
                >
                  {item.icon}
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
