import { Code2, Terminal, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { ProgressTrack, MiniButton, OutcomeIcon } from './ResultPrimitives';
import {
  scoreColor,
  OUTCOME,
  answerOutcome,
  codingOutcome,
  testsOf,
  plannedTestCount,
  passedTestCount,
  rowTitle,
  codeOf,
} from '@/utils/result.utils';
import type { AptitudeBand, CodingBand, CodingRow } from '@/utils/result.utils';

// ── Shared band shell ──────────────────────────────────────────────────

function BandShell({
  name,
  pct,
  headline,
  subline,
  children,
}: {
  name: string;
  pct: number;
  headline: string;
  subline?: string;
  children: React.ReactNode;
}) {
  const color = scoreColor(pct);

  return (
    <Card className="overflow-hidden" padding="none">
      {/* Accent strip keeps the band readable at a glance */}
      <div style={{ height: 4, background: color }} />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <p className="text-sm font-bold text-[var(--text)] truncate">{name}</p>
            </div>
            {subline && (
              <p className="text-[11px] text-[var(--textTertiary)] mt-1">{subline}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold leading-none" style={{ color }}>
              {pct}%
            </p>
            <p className="text-[11px] font-medium text-[var(--textTertiary)] mt-1">{headline}</p>
          </div>
        </div>

        <ProgressTrack percentage={pct} color={color} />

        {children}
      </CardContent>
    </Card>
  );
}

// ── Aptitude bands ─────────────────────────────────────────────────────

export function AptitudeBandCards({
  bands,
  onSelectQuestion,
}: {
  bands: AptitudeBand[];
  /** Jump the question list to this flat index. */
  onSelectQuestion?: (index: number) => void;
}) {
  if (bands.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionLabel icon={<Layers size={13} />} text="Performance by difficulty" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {bands.map((band) => (
          <BandShell
            key={band.name}
            name={band.name}
            pct={band.pct}
            headline={`${band.correct}/${band.total} correct`}
            subline={`${band.answered} answered · ${band.total - band.answered} skipped`}
          >
            <div className="flex flex-wrap gap-1.5">
              {band.items.map((item) => {
                const outcome = answerOutcome(item.correct, item.answered);
                const style = OUTCOME[outcome];

                return (
                  <button
                    key={item.index}
                    type="button"
                    onClick={() => onSelectQuestion?.(item.index)}
                    title={`Q${item.number}: ${style.aptitudeLabel}`}
                    className="inline-flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-lg text-[11px] font-bold
                      transition-transform duration-150 hover:scale-105 active:scale-95"
                    style={{ background: style.bg, color: style.color }}
                  >
                    Q{item.number}
                    <OutcomeIcon outcome={outcome} size={11} />
                  </button>
                );
              })}
            </div>
          </BandShell>
        ))}
      </div>

      <Legend
        items={[
          { color: 'var(--success)', label: 'Correct' },
          { color: 'var(--error)', label: 'Incorrect' },
          { color: 'var(--warning)', label: 'Not answered' },
        ]}
      />
    </div>
  );
}

// ── Coding bands ───────────────────────────────────────────────────────

export function CodingBandCards({
  bands,
  onViewCode,
  onViewOutput,
}: {
  bands: CodingBand[];
  onViewCode: (row: CodingRow) => void;
  onViewOutput: (row: CodingRow) => void;
}) {
  if (bands.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionLabel icon={<Layers size={13} />} text="Performance by difficulty" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {bands.map((band) => (
          <BandShell
            key={band.name}
            name={band.name}
            pct={band.pct}
            headline={`${band.testsPassed}/${band.testsTotal} test cases`}
            subline={`${band.solved}/${band.rows.length} solved · ${band.attempted} attempted`}
          >
            <div className="divide-y divide-[var(--borderMuted)]">
              {band.rows.map((row) => {
                const tests = testsOf(row);
                const passed = passedTestCount(row);
                const total = plannedTestCount(row);
                const outcome = codingOutcome(row);
                const style = OUTCOME[outcome];

                return (
                  <div key={row.key} className="flex items-center gap-2 py-2.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text)] flex-shrink-0">
                          Q{row.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold flex-shrink-0"
                          style={{ color: style.color }}
                        >
                          <OutcomeIcon outcome={outcome} size={11} />
                          {style.codingLabel}
                        </span>
                        <span className="text-[11px] text-[var(--textTertiary)] flex-shrink-0">
                          ({passed}/{total} passed)
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--textSecondary)] truncate mt-0.5">
                        {rowTitle(row)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <MiniButton
                        icon={<Code2 size={11} />}
                        onClick={() => onViewCode(row)}
                        disabled={!codeOf(row)}
                        title={codeOf(row) ? 'View submitted code' : 'No code submitted'}
                      >
                        Code
                      </MiniButton>
                      <MiniButton
                        tone="primary"
                        icon={<Terminal size={11} />}
                        onClick={() => onViewOutput(row)}
                        disabled={tests.length === 0}
                        title={tests.length ? 'View test-case output' : 'No test run recorded'}
                      >
                        Output
                      </MiniButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </BandShell>
        ))}
      </div>

      <Legend
        items={[
          { color: 'var(--success)', label: 'All test cases passed' },
          { color: 'var(--error)', label: 'Attempted, tests failing' },
          { color: 'var(--warning)', label: 'Not attempted' },
        ]}
      />
    </div>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--textTertiary)]">
      {icon}
      <p className="text-[10px] font-bold uppercase tracking-widest">{text}</p>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          <span className="text-[11px] text-[var(--textTertiary)]">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
