import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Where a page was opened from, so it can offer a way back. */
export interface NavOrigin {
  /** Name of the screen to return to, e.g. "Candidates". */
  label: string;
  path: string;
  /** Router state to hand back, so the origin restores its context. */
  state?: unknown;
}

/**
 * "Back to X" for cross-screen jumps.
 *
 * Screens like ATS Screening and Assign are reachable both from the sidebar and
 * as a step in a flow that starts on another page. Renders only in the second
 * case — the caller passes `state: { from }` when it navigates — so a page
 * opened directly from the sidebar shows nothing.
 *
 * Uses the recorded origin rather than `history.back()`, so it still returns
 * somewhere sensible after a reload, and can hand context back.
 */
export function BackLink({ className = '' }: Readonly<{ className?: string }>) {
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as { from?: NavOrigin } | null)?.from;
  if (!from?.path || !from?.label) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(from.path, { state: from.state })}
      className={`inline-flex items-center gap-2 text-sm font-medium text-[var(--textSecondary)] hover:text-[var(--primary)] transition-colors ${className}`}
    >
      <ArrowLeft size={16} />
      Back to {from.label}
    </button>
  );
}
