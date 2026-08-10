import { Mic, Volume2, VolumeX, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { NoiseBand } from '@/hooks/useMicNoiseLevel';

/**
 * The room-noise readout on the exam instructions screen.
 *
 * Three states, one meaning each: green means go, amber means "we can hear
 * something, it's fine", red means the exam is held until it's quieter. The band
 * is never communicated by colour alone — every state carries an icon and a
 * sentence, so it still reads correctly for a colour-blind candidate.
 */

interface NoiseLevelMeterProps {
  band: NoiseBand;
  /** 0–100 meter fill. */
  level: number;
  measuring: boolean;
  /** False when a red reading is advisory rather than blocking. */
  blocksStart: boolean;
}

const BAND_STYLES: Record<
  NoiseBand,
  { label: string; help: string; bar: string; text: string; icon: typeof Mic }
> = {
  quiet: {
    label: 'Quiet',
    help: 'Your surroundings are quiet enough for the exam.',
    bar: 'bg-[var(--success)]',
    text: 'text-[var(--success)]',
    icon: CheckCircle2,
  },
  moderate: {
    label: 'Some background noise',
    help: 'We can hear some noise around you. You can still start, but a quieter spot is better.',
    bar: 'bg-[var(--warning)]',
    text: 'text-[var(--warning)]',
    icon: Volume2,
  },
  loud: {
    label: 'Too noisy',
    help: 'It is too loud around you. Please move somewhere quieter — the meter turns green when you are ready.',
    bar: 'bg-[var(--error)]',
    text: 'text-[var(--error)]',
    icon: AlertTriangle,
  },
};

export function NoiseLevelMeter({ band, level, measuring, blocksStart }: Readonly<NoiseLevelMeterProps>) {
  const style = BAND_STYLES[band];
  const Icon = measuring ? style.icon : VolumeX;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <Mic size={16} className="text-[var(--primary)]" />
          Background noise
        </span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${measuring ? style.text : 'text-[var(--textTertiary)]'}`}>
          <Icon size={16} />
          {measuring ? style.label : 'Listening…'}
        </span>
      </div>

      {/* Meter. The track is segmented so the green/amber/red zones stay visible
          even while the fill itself is low. */}
      <div
        className="relative h-2.5 w-full rounded-full bg-[var(--surface2)] overflow-hidden"
        role="meter"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Background noise: ${measuring ? style.label : 'measuring'}`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-200 ease-out ${measuring ? style.bar : 'bg-[var(--textTertiary)]'}`}
          style={{ width: `${measuring ? Math.max(level, 3) : 3}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[0.6875rem] text-[var(--textTertiary)]">
        <span>Quiet</span>
        <span>Noisy</span>
      </div>

      <p className={`text-xs ${band === 'loud' && measuring ? style.text : 'text-[var(--textSecondary)]'}`}>
        {measuring
          ? style.help
          : 'Measuring the noise around you. Please stay quiet for a moment.'}
        {band === 'loud' && measuring && !blocksStart && ' Your exam can still be started.'}
      </p>
    </div>
  );
}
