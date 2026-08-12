import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check, X, Minus } from 'lucide-react';
import { scoreColor } from '@/utils/result.utils';
import type { Outcome } from '@/utils/result.utils';

export function OutcomeIcon({ outcome, size = 12 }: { outcome: Outcome; size?: number }) {
  if (outcome === 'pass') return <Check size={size} strokeWidth={3} />;
  if (outcome === 'fail') return <X size={size} strokeWidth={3} />;
  return <Minus size={size} strokeWidth={3} />;
}

// ── Radial score (SVG donut) ───────────────────────────────────────────

export function RadialScore({
  score,
  size = 80,
  stroke = 8,
  label,
  status,
}: {
  score: number;
  size?: number;
  stroke?: number;
  /** Small caption under the number, e.g. "Score". */
  label?: string;
  /**
   * The module's recorded verdict, when it has one. Given it, the dial is
   * coloured by pass/fail rather than by the generic score bands — otherwise a
   * pass below the band threshold is drawn red next to its own PASSED badge.
   */
  status?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const color = scoreColor(score, status);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bgWash)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold text-[var(--text)] leading-none"
          style={{ fontSize: Math.max(13, size * 0.22) }}
        >
          {score}%
        </span>
        {label && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--textTertiary)] mt-1">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Summary stat tile ──────────────────────────────────────────────────

export type StatTone = 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'primary';

const TONE_COLOR: Record<StatTone, string> = {
  neutral: 'var(--text)',
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  primary: 'var(--primary)',
};

const TONE_BG: Record<StatTone, string> = {
  neutral: 'var(--bgSubtle)',
  success: 'var(--successMuted, rgba(16,185,129,0.12))',
  error: 'var(--errorMuted, rgba(239,68,68,0.12))',
  warning: 'var(--warningMuted, rgba(245,158,11,0.12))',
  info: 'var(--infoMuted, rgba(6,182,212,0.12))',
  primary: 'var(--primaryMuted, rgba(16,185,129,0.12))',
};

/** Compact value/label tile — the building block of the summary grids. */
export function SummaryStat({
  icon,
  value,
  label,
  tone = 'neutral',
  hint,
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  tone?: StatTone;
  hint?: string;
}) {
  const color = TONE_COLOR[tone];

  return (
    <div
      className="rounded-xl px-4 py-3 border border-[var(--borderMuted)] transition-colors"
      style={{ background: TONE_BG[tone] }}
      title={hint}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span style={{ color }}>{icon}</span>}
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color, opacity: 0.75 }}
        >
          {label}
        </span>
      </div>
      <p className="text-xl font-bold leading-tight" style={{ color }}>
        {value}
      </p>
      {hint && <p className="text-[11px] mt-0.5 text-[var(--textTertiary)]">{hint}</p>}
    </div>
  );
}

// ── Progress track ─────────────────────────────────────────────────────

export function ProgressTrack({
  percentage,
  color,
  height = 8,
}: {
  percentage: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.min(Math.max(percentage, 0), 100);
  return (
    <div
      className="rounded-full bg-[var(--bgWash)] overflow-hidden w-full"
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color ?? scoreColor(pct) }}
      />
    </div>
  );
}

/** Labelled bar — label left, "72% (7/10)" right. */
export function SkillBar({
  label,
  percentage,
  detail,
}: {
  label: string;
  percentage: number;
  detail?: string;
}) {
  const color = scoreColor(percentage);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-3">
        <span className="text-sm font-medium text-[var(--text)] truncate">{label}</span>
        <span className="text-xs font-semibold flex-shrink-0" style={{ color }}>
          {percentage}%{' '}
          {detail && <span className="text-[var(--textTertiary)] font-normal">({detail})</span>}
        </span>
      </div>
      <ProgressTrack percentage={percentage} color={color} />
    </div>
  );
}

// ── Mini button ────────────────────────────────────────────────────────

/** Row-scale action button — smaller than the design-system `Button`. */
export function MiniButton({
  children,
  icon,
  tone = 'neutral',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'primary';
}) {
  const toneStyles =
    tone === 'primary'
      ? 'border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primaryMuted,rgba(16,185,129,0.12))]'
      : 'border-[var(--borderMuted)] text-[var(--textSecondary)] hover:text-[var(--text)] hover:border-[var(--borderStrong)] hover:bg-[var(--bgSubtle)]';

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold
        transition-all duration-150 active:scale-[0.97]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        ${toneStyles} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Filter chips ───────────────────────────────────────────────────────

export interface FilterChip<T extends string> {
  value: T;
  label: string;
  count?: number;
  tone?: StatTone;
}

export function FilterChips<T extends string>({
  chips,
  active,
  onChange,
}: {
  chips: FilterChip<T>[];
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = chip.value === active;
        const color = TONE_COLOR[chip.tone ?? 'neutral'];
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150
              ${isActive ? 'shadow-sm' : 'hover:bg-[var(--bgSubtle)]'}`}
            style={{
              borderColor: isActive ? color : 'var(--borderMuted)',
              background: isActive ? TONE_BG[chip.tone ?? 'neutral'] : 'transparent',
              color: isActive ? color : 'var(--textSecondary)',
            }}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span
                className="px-1.5 rounded-full text-[10px] font-bold"
                style={{
                  background: isActive ? 'transparent' : 'var(--bgWash)',
                  color: isActive ? color : 'var(--textTertiary)',
                }}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
