interface AIAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  /** 0..1 live audio level, drives the waveform. */
  amplitude?: number;
  size?: 'sm' | 'md' | 'lg';
  /** 'stacked' centres the orb with the label under it; 'inline' sits it in a row. */
  layout?: 'stacked' | 'inline';
  className?: string;
}

type Mode = 'speaking' | 'listening' | 'thinking' | 'idle';

const SIZES = {
  sm: { orb: 'w-12 h-12', halo: 'w-[4.5rem] h-[4.5rem]', wave: 14, bar: 'w-[2px]', gap: 'gap-[3px]', label: 'text-[11px]' },
  md: { orb: 'w-20 h-20', halo: 'w-28 h-28', wave: 22, bar: 'w-1', gap: 'gap-1', label: 'text-xs' },
  lg: { orb: 'w-28 h-28', halo: 'w-40 h-40', wave: 32, bar: 'w-1.5', gap: 'gap-1.5', label: 'text-sm' },
};

const THEMES: Record<Mode, {
  label: string;
  hint: string;
  core: string;
  blobA: string;
  blobB: string;
  halo: string;
  bar: string;
  text: string;
  dot: string;
}> = {
  speaking: {
    label: 'Speaking',
    hint: 'Listen along — your turn is next',
    core: 'linear-gradient(145deg, #6366f1 0%, #8b5cf6 55%, #a855f7 100%)',
    blobA: 'radial-gradient(circle, rgba(196,181,253,0.85) 0%, transparent 62%)',
    blobB: 'radial-gradient(circle, rgba(129,140,248,0.75) 0%, transparent 65%)',
    halo: 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 68%)',
    bar: 'rgba(255,255,255,0.92)',
    text: 'text-indigo-500 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  listening: {
    label: 'Listening',
    hint: 'Go ahead — we can hear you',
    core: 'linear-gradient(145deg, #059669 0%, #10b981 55%, #34d399 100%)',
    blobA: 'radial-gradient(circle, rgba(167,243,208,0.85) 0%, transparent 62%)',
    blobB: 'radial-gradient(circle, rgba(45,212,191,0.75) 0%, transparent 65%)',
    halo: 'radial-gradient(circle, rgba(16,185,129,0.22) 0%, transparent 68%)',
    bar: 'rgba(255,255,255,0.95)',
    text: 'text-emerald-600 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  thinking: {
    label: 'Thinking',
    hint: 'Taking a moment with your answer',
    core: 'linear-gradient(145deg, #d97706 0%, #f59e0b 55%, #fbbf24 100%)',
    blobA: 'radial-gradient(circle, rgba(254,215,170,0.85) 0%, transparent 62%)',
    blobB: 'radial-gradient(circle, rgba(251,191,36,0.75) 0%, transparent 65%)',
    halo: 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 68%)',
    bar: 'rgba(255,255,255,0.9)',
    text: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  idle: {
    label: 'Ready when you are',
    hint: '',
    core: 'linear-gradient(145deg, #64748b 0%, #94a3b8 55%, #cbd5e1 100%)',
    blobA: 'radial-gradient(circle, rgba(226,232,240,0.7) 0%, transparent 62%)',
    blobB: 'radial-gradient(circle, rgba(148,163,184,0.6) 0%, transparent 65%)',
    halo: 'radial-gradient(circle, rgba(148,163,184,0.16) 0%, transparent 68%)',
    bar: 'rgba(255,255,255,0.8)',
    text: 'text-[var(--textTertiary)]',
    dot: 'bg-slate-400',
  },
};

/** Centre bars tallest, so the waveform reads as a voice rather than a chart. */
const BAR_WEIGHTS = [0.4, 0.66, 0.9, 1, 0.9, 0.66, 0.4];

/**
 * The interviewer's presence on screen.
 *
 * Deliberately not a face. Drawn eyes and a mouth read as a cartoon watching
 * the candidate — the wrong note for the one thing on the page they are meant
 * to relax in front of. What is left is what they actually need to know: whose
 * turn it is, and whether their voice is getting through. A soft orb that
 * drifts on its own and a waveform that moves with the audio answer both
 * without staring back.
 */
export function AIAvatar({
  isSpeaking,
  isListening,
  isThinking,
  amplitude = 0,
  size = 'md',
  layout = 'stacked',
  className = '',
}: AIAvatarProps) {
  const s = SIZES[size];
  const mode: Mode = isSpeaking
    ? 'speaking'
    : isThinking
      ? 'thinking'
      : isListening
        ? 'listening'
        : 'idle';
  const theme = THEMES[mode];
  const live = mode === 'speaking' || mode === 'listening';
  const level = Math.min(1, Math.max(0, amplitude));

  const orb = (
    <div className={`relative flex flex-shrink-0 items-center justify-center ${s.halo}`}>
      {/* Halo, scaled by the voice so the whole shape breathes with it. */}
      <div
        className="absolute inset-0 rounded-full orb-halo"
        style={{
          background: theme.halo,
          transform: `scale(${1 + level * 0.18})`,
          transition: 'transform 120ms ease-out, background 400ms ease',
        }}
      />

      <div
        className={`relative ${s.orb} rounded-full overflow-hidden orb-float`}
        style={{
          background: theme.core,
          boxShadow: live
            ? '0 10px 40px -8px rgba(15, 23, 42, 0.45), inset 0 1px 12px rgba(255,255,255,0.35)'
            : '0 8px 28px -10px rgba(15, 23, 42, 0.35), inset 0 1px 10px rgba(255,255,255,0.25)',
          transition: 'background 400ms ease, box-shadow 400ms ease',
        }}
      >
        {/* Two slow, offset blobs. Nothing loops in step, so the orb never
            settles into a mechanical rhythm. */}
        <div className="absolute inset-[-25%] orb-drift-a" style={{ background: theme.blobA }} />
        <div className="absolute inset-[-25%] orb-drift-b" style={{ background: theme.blobB }} />
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.28) 0%, transparent 45%)' }}
        />

        {/* Waveform */}
        <div className={`absolute inset-0 flex items-center justify-center ${s.gap}`}>
          {BAR_WEIGHTS.map((weight, i) => (
            <div
              key={i}
              className={`${s.bar} rounded-full ${live ? '' : mode === 'thinking' ? 'orb-bar-think' : 'orb-bar-idle'}`}
              style={{
                height: s.wave,
                background: theme.bar,
                transformOrigin: 'center',
                transform: live
                  ? `scaleY(${(0.14 + level * weight * 0.86).toFixed(3)})`
                  : undefined,
                transition: live ? 'transform 90ms ease-out' : undefined,
                animationDelay: live ? undefined : `${i * 0.11}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const status = (
    <div className={`flex items-center gap-2 ${layout === 'stacked' ? 'justify-center' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${theme.dot} ${live ? 'animate-pulse' : ''}`} />
      <span className={`${s.label} font-medium whitespace-nowrap ${theme.text}`}>{theme.label}</span>
    </div>
  );

  if (layout === 'inline') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {orb}
        <div className="min-w-0">
          {status}
          {theme.hint && (
            <p className="text-[11px] text-[var(--textTertiary)] truncate">{theme.hint}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {orb}
      {status}
    </div>
  );
}
