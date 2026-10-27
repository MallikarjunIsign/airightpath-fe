import { Zap } from 'lucide-react';

/** Line-numbered, scrollable source view used by the result pages and modals. */
export function CodeBlock({
  code,
  language,
  maxHeight = 400,
}: {
  code: string;
  language?: string;
  maxHeight?: number;
}) {
  const lines = code.split('\n');

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--borderMuted)]">
      <div
        className="px-5 py-3 text-xs font-semibold flex items-center justify-between gap-3 border-b border-[var(--borderMuted)]"
        style={{ background: 'var(--bgSubtle)', color: 'var(--textSecondary)' }}
      >
        <span className="flex items-center gap-2">
          <Zap size={12} />
          {language ?? 'code'}
        </span>
        <span className="font-normal text-[var(--textTertiary)]">{lines.length} lines</span>
      </div>
      <pre
        className="text-[13px] leading-6 p-5 overflow-x-auto overflow-y-auto font-mono"
        style={{ background: 'var(--bgMuted)', color: 'var(--text)', maxHeight }}
      >
        <code>
          {lines.map((line, i) => (
            <div
              key={i}
              className="flex hover:bg-[var(--bgSubtle)] -mx-5 px-5 transition-colors"
            >
              <span
                className="select-none w-10 text-right mr-5 flex-shrink-0 font-mono"
                style={{ color: 'var(--textQuaternary)' }}
              >
                {i + 1}
              </span>
              <span className="flex-1">{line || ' '}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** Labelled input/output panel shared by test-case cards and sample I/O. */
export function IOBlock({
  label,
  value,
  highlight,
  className = '',
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`px-4 py-3 ${className}`} style={{ background: 'var(--bgSubtle)' }}>
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--textTertiary)' }}
      >
        {label}
      </p>
      <pre
        className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed"
        style={{ color: highlight ? 'var(--error)' : 'var(--text)' }}
      >
        {value || '(empty)'}
      </pre>
    </div>
  );
}
