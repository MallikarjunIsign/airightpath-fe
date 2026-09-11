import { Check } from 'lucide-react';

/**
 * Where you are in a Test Mode run.
 *
 * A rehearsal is worth less if you cannot tell which of the candidate's stages
 * you are looking at, so the stages are named on screen rather than implied by
 * whatever happens to be rendered. Completed stages stay clickable: going back
 * to re-read the instructions is exactly the kind of thing this feature is for,
 * and unlike the real exam there is nothing to protect against.
 */
export function TestModeStepper<T extends string>({
  stages,
  current,
  reachable,
  onSelect,
}: Readonly<{
  stages: readonly { id: T; label: string }[];
  current: T;
  /** Stages the run has already reached, and may therefore return to. */
  reachable: readonly T[];
  onSelect: (stage: T) => void;
}>) {
  const currentIndex = stages.findIndex((stage) => stage.id === current);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {stages.map((stage, index) => {
        const isCurrent = stage.id === current;
        const isDone = index < currentIndex;
        const canVisit = reachable.includes(stage.id) && !isCurrent;

        let circle = 'bg-[var(--surface2)] text-[var(--textTertiary)]';
        if (isCurrent) circle = 'bg-[var(--primary)] text-white';
        else if (isDone) circle = 'bg-[var(--success)] text-white';

        return (
          <li key={stage.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canVisit}
              onClick={() => canVisit && onSelect(stage.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`
                flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm
                transition-colors
                ${canVisit ? 'hover:bg-[var(--surface1)] cursor-pointer' : 'cursor-default'}
                ${isCurrent ? 'font-semibold text-[var(--text)]' : 'text-[var(--textSecondary)]'}
              `}
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${circle}`}
              >
                {isDone ? <Check size={12} /> : index + 1}
              </span>
              {stage.label}
            </button>
            {index < stages.length - 1 && (
              <span className="text-[var(--textTertiary)]" aria-hidden="true">
                /
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
