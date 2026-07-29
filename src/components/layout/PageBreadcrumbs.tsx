import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb trail derived from the current pathname.
 * Rendered inside the page content (the outlet), not the header.
 */
export function PageBreadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, i) => ({
    label: segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    path: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 flex-wrap min-w-0 text-[0.8125rem] mb-4 sm:mb-6"
    >
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && (
            <ChevronRight
              size={14}
              className="text-[var(--textTertiary)] flex-shrink-0 opacity-60"
            />
          )}
          {crumb.isLast ? (
            <span className="truncate text-[var(--text)] font-semibold">{crumb.label}</span>
          ) : (
            <button
              type="button"
              onClick={() => navigate(crumb.path)}
              className="truncate text-[var(--textTertiary)] hover:text-[var(--textSecondary)] transition-colors duration-150 cursor-pointer"
            >
              {crumb.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
