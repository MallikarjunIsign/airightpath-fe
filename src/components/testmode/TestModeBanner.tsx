import { FlaskConical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TEST_MODE_NOTICE } from '@/config/test-mode';

/**
 * The strip every Test Mode screen wears.
 *
 * It is not decoration. These screens are pixel-for-pixel the candidate's
 * screens, so without a standing marker an admin can genuinely lose track of
 * whether they are looking at a rehearsal or at someone's real exam. The banner
 * states the guarantee in the same words everywhere and gives the one control a
 * sandbox needs: start over.
 */
export function TestModeBanner({
  title,
  onReset,
  resetLabel = 'Start over',
}: Readonly<{
  title: string;
  /** Omitted on screens with nothing yet to discard, such as the hub. */
  onReset?: () => void;
  resetLabel?: string;
}>) {
  return (
    <div
      className="
        rounded-2xl border border-dashed border-[var(--warning)]
        bg-[var(--warning)]/5 px-4 py-3
        flex flex-wrap items-center gap-x-4 gap-y-2
      "
      role="note"
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <FlaskConical size={18} className="text-[var(--warning)]" />
        <span className="font-semibold text-[var(--text)]">Test Mode</span>
        <span className="text-[var(--textTertiary)]">/</span>
        <span className="text-[var(--text)]">{title}</span>
      </div>

      <p className="text-sm text-[var(--textSecondary)] flex-1 min-w-[16rem]">
        {TEST_MODE_NOTICE}
      </p>

      {onReset && (
        <Button variant="outline" size="sm" leftIcon={<RotateCcw size={14} />} onClick={onReset}>
          {resetLabel}
        </Button>
      )}
    </div>
  );
}
