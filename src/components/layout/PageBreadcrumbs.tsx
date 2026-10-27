import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ROUTES } from '@/config/routes';

/**
 * Segments whose title-cased spelling reads like a URL fragment ("Ats", "Batch")
 * rather than the name people see in the sidebar. Anything not listed here falls
 * back to the generic title-casing below.
 */
const SEGMENT_LABELS: Record<string, string> = {
  ats: 'Screen with ATS',
  batch: 'Bulk ATS Check',
};

/**
 * Every path that is actually routed, so a crumb is only ever a link when it
 * leads somewhere.
 *
 * Several paths are grouping segments with no page of their own —
 * `/admin/assessments` exists solely as a prefix of `/admin/assessments/assign`
 * and `/…/results`. Linking them sent the admin to a 404. Built from ROUTES so
 * it cannot drift: parameterised entries are excluded because a crumb only ever
 * holds a concrete path.
 */
const NAVIGABLE_PATHS = new Set(
  Object.values(ROUTES)
    .flatMap((group) => Object.values(group))
    .filter((value): value is string => typeof value === 'string' && !value.includes(':')),
);

/** A malformed escape sequence should show the raw segment, not throw. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Breadcrumb trail derived from the current pathname.
 * Rendered inside the page content (the outlet), not the header.
 */
export function PageBreadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    return {
      label:
        SEGMENT_LABELS[segment.toLowerCase()] ??
        // Decode first: a path segment like an email arrives percent-encoded.
        safeDecode(segment).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      path,
      isLast: i === segments.length - 1,
      isNavigable: NAVIGABLE_PATHS.has(path),
    };
  });

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
          {crumb.isLast || !crumb.isNavigable ? (
            // A grouping segment reads as context, not as a dead link: no
            // pointer, no hover state, nothing that invites a click.
            <span
              className={`truncate ${
                crumb.isLast
                  ? 'text-[var(--text)] font-semibold'
                  : 'text-[var(--textTertiary)]'
              }`}
            >
              {crumb.label}
            </span>
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
