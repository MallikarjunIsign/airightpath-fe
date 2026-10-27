import { CheckCircle, XCircle, FileText, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { CodeBlock, IOBlock } from './CodeBlock';
import { TestCaseCard, PlannedTestCaseCard } from './TestCaseCard';
import {
  codeOf,
  testsOf,
  rowTitle,
  rowLanguage,
  passedTestCount,
  normalizeBand,
  isAnswered,
} from '@/utils/result.utils';
import type { CodingRow } from '@/utils/result.utils';
import type { AptitudeAnswer } from '@/types/result.types';
import type { RawQuestion } from '@/types/assessment.types';

// ── Aptitude question paper ────────────────────────────────────────────

/** Options arrive as {"A":"text"} or a legacy array — flatten both. */
function optionsOf(q?: RawQuestion): { key: string; text: string }[] {
  if (!q?.options) return [];
  if (Array.isArray(q.options)) {
    return q.options.map((text, i) => ({ key: String.fromCharCode(65 + i), text: String(text) }));
  }
  return Object.entries(q.options).map(([key, text]) => ({ key, text: String(text) }));
}

/** The stored answer may be the option key ("B") or the option text itself. */
function matchesOption(answer: string | undefined, option: { key: string; text: string }): boolean {
  const value = (answer ?? '').toString().trim().toLowerCase();
  if (!value) return false;
  return value === option.key.toLowerCase() || value === option.text.trim().toLowerCase();
}

export function AptitudePaperModal({
  isOpen,
  onClose,
  paper,
  answers,
}: {
  isOpen: boolean;
  onClose: () => void;
  paper: RawQuestion[];
  answers: AptitudeAnswer[];
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aptitude Question Paper" size="xl">
      {paper.length === 0 && (
        <div className="flex items-start gap-2 mb-4 px-4 py-3 rounded-xl border border-[var(--borderMuted)] bg-[var(--bgSubtle)]">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]" />
          <p className="text-xs text-[var(--textSecondary)]">
            The original paper could not be loaded — showing the questions and answers stored
            with the result instead.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {answers.map((answer, idx) => {
          const question = paper.find((q) => String(q.id) === String(answer.questionId)) ?? paper[idx];
          const options = optionsOf(question);
          const text =
            answer.questionText || answer.question || question?.questionText || question?.question || '';
          const correct = answer.correctAnswer ?? question?.correctAnswer;
          const band = normalizeBand(answer.Difficulty || answer.category || question?.Difficulty);

          return (
            <div
              key={answer.questionId ?? idx}
              className="rounded-xl border border-[var(--borderMuted)] p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: answer.isCorrect
                      ? 'var(--successMuted, rgba(16,185,129,0.12))'
                      : 'var(--errorMuted, rgba(239,68,68,0.12))',
                    color: answer.isCorrect ? 'var(--success)' : 'var(--error)',
                  }}
                >
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text)] leading-relaxed">
                    {text || `Question ${idx + 1}`}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="primary" size="sm">{band}</Badge>
                    {answer.marks !== undefined && (
                      <span className="text-[11px] text-[var(--textTertiary)]">
                        Marks: <strong className="text-[var(--text)]">{answer.marks}</strong>
                      </span>
                    )}
                    {!isAnswered(answer) && (
                      <Badge variant="warning" size="sm">Not answered</Badge>
                    )}
                  </div>

                  {options.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {options.map((opt) => {
                        const isChosen = matchesOption(answer.selectedAnswer, opt);
                        const isCorrect = matchesOption(correct, opt);
                        const tone = isCorrect
                          ? 'var(--success)'
                          : isChosen
                            ? 'var(--error)'
                            : 'var(--textSecondary)';

                        return (
                          <div
                            key={opt.key}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm"
                            style={{
                              borderColor: isCorrect || isChosen ? tone : 'var(--borderMuted)',
                              background:
                                isCorrect || isChosen ? 'var(--bgSubtle)' : 'transparent',
                              color: tone,
                            }}
                          >
                            <span className="font-bold text-xs w-5 flex-shrink-0">{opt.key}</span>
                            <span className="flex-1">{opt.text}</span>
                            {isCorrect && <CheckCircle size={14} style={{ color: 'var(--success)' }} />}
                            {isChosen && !isCorrect && (
                              <XCircle size={14} style={{ color: 'var(--error)' }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                      <span className="text-[var(--textTertiary)]">
                        Selected:{' '}
                        <strong style={{ color: answer.isCorrect ? 'var(--success)' : 'var(--error)' }}>
                          {(answer.selectedAnswer ?? '').toString().trim() || 'Not answered'}
                        </strong>
                      </span>
                      <span className="text-[var(--textTertiary)]">
                        Correct: <strong style={{ color: 'var(--success)' }}>{correct ?? '--'}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Coding question paper ──────────────────────────────────────────────

export function CodingPaperModal({
  isOpen,
  onClose,
  rows,
}: {
  isOpen: boolean;
  onClose: () => void;
  rows: CodingRow[];
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Programming Question Paper" size="xl">
      <div className="space-y-4">
        {rows.map((row) => {
          const question = row.question;
          const prompt = question?.description || question?.question || '';

          return (
            <div key={row.key} className="rounded-xl border border-[var(--borderMuted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    Q{row.label}. {rowTitle(row)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="primary" size="sm">
                      {normalizeBand(question?.Difficulty)}
                    </Badge>
                    {question?.marks !== undefined && (
                      <span className="text-[11px] text-[var(--textTertiary)]">
                        Marks: <strong className="text-[var(--text)]">{question.marks}</strong>
                      </span>
                    )}
                    {question?.testCases?.length ? (
                      <span className="text-[11px] text-[var(--textTertiary)]">
                        {question.testCases.length} test cases
                      </span>
                    ) : null}
                  </div>
                </div>
                <FileText size={16} className="text-[var(--textTertiary)] flex-shrink-0" />
              </div>

              {prompt ? (
                <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap mt-3">
                  {prompt}
                </p>
              ) : (
                <p className="text-xs text-[var(--textTertiary)] italic mt-3">
                  Full problem statement is not stored with this result.
                </p>
              )}

              {(question?.sampleInput || question?.sampleOutput) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {question.sampleInput && (
                    <IOBlock
                      label="Sample Input"
                      value={question.sampleInput}
                      className="rounded-lg border border-[var(--borderMuted)]"
                    />
                  )}
                  {question.sampleOutput && (
                    <IOBlock
                      label="Sample Output"
                      value={question.sampleOutput}
                      className="rounded-lg border border-[var(--borderMuted)]"
                    />
                  )}
                </div>
              )}

              {question?.testCases?.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Test Cases
                  </p>
                  {question.testCases.map((tc, i) => (
                    <PlannedTestCaseCard key={`${row.key}-tc-${i}`} index={i} test={tc} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Submitted code ─────────────────────────────────────────────────────

export function SubmittedCodeModal({
  row,
  onClose,
}: {
  row: CodingRow | null;
  onClose: () => void;
}) {
  const code = row ? codeOf(row) : '';

  return (
    <Modal
      isOpen={!!row}
      onClose={onClose}
      title={row ? `Q${row.label} — Submitted Code` : ''}
      size="xl"
    >
      {row && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{rowTitle(row)}</p>
            {rowLanguage(row) && (
              <Badge variant="primary" size="sm">{rowLanguage(row)}</Badge>
            )}
          </div>
          {code ? (
            <CodeBlock code={code} language={rowLanguage(row)} maxHeight={520} />
          ) : (
            <p className="text-sm text-[var(--textSecondary)] py-6 text-center">
              No code recorded for this question.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Test output ────────────────────────────────────────────────────────

export function TestOutputModal({
  row,
  onClose,
}: {
  row: CodingRow | null;
  onClose: () => void;
}) {
  const tests = row ? testsOf(row) : [];
  const passed = row ? passedTestCount(row) : 0;

  return (
    <Modal
      isOpen={!!row}
      onClose={onClose}
      title={row ? `Q${row.label} — Test Output` : ''}
      size="xl"
    >
      {row && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{rowTitle(row)}</p>
            <span className="text-xs text-[var(--textSecondary)]">
              <strong style={{ color: 'var(--success)' }}>{passed} passed</strong>
              {' · '}
              <strong style={{ color: 'var(--error)' }}>{tests.length - passed} failed</strong>
              {' · '}
              {tests.length} total
            </span>
          </div>

          {tests.length > 0 ? (
            tests.map((tc, i) => <TestCaseCard key={`${row.key}-out-${i}`} index={i} test={tc} />)
          ) : (
            <p className="text-sm text-[var(--textSecondary)] py-6 text-center">
              This question was never run against the test cases.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
