import { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
import { applyJobUrl } from '@/config/routes';
import { useToast } from '@/components/ui/Toast';

interface ShareJobLinkProps {
  jobPrefix: string;
  /** Compact single-line variant for tight spaces (e.g. list rows). */
  compact?: boolean;
}

/**
 * Read-only field showing the shareable apply link for a job, with a copy button.
 * Anyone opening the link lands directly on this job's application form.
 */
export function ShareJobLink({ jobPrefix, compact = false }: Readonly<ShareJobLinkProps>) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = applyJobUrl(jobPrefix);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Apply link copied to clipboard.', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy the link. Please copy it manually.', 'error');
    }
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <Link2 size={16} className="text-[var(--primary)]" />
          Shareable apply link
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 h-10 rounded-lg border border-[var(--inputBorder)] bg-[var(--surface1)] px-3 text-sm text-[var(--textSecondary)] focus:outline-none focus:border-[var(--inputFocus)]"
        />
        <button
          type="button"
          onClick={copy}
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
            copied
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-[var(--primary)] text-white hover:opacity-90'
          }`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {!compact && (
        <p className="text-xs text-[var(--textSecondary)]">
          Anyone with this link can open the application form for this job directly. They'll be
          asked to sign in first.
        </p>
      )}
    </div>
  );
}
