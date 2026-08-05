import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { IOBlock } from './CodeBlock';
import type { TestCaseResultDTO } from '@/types/compiler.types';
import type { TestCase } from '@/types/assessment.types';

/** An executed test case — input, expected vs actual, and any compiler error. */
export function TestCaseCard({ index, test }: { index: number; test: TestCaseResultDTO }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: test.passed ? 'var(--success)' : 'var(--error)', borderWidth: 1 }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: test.passed
            ? 'var(--successMuted, rgba(16,185,129,0.08))'
            : 'var(--errorMuted, rgba(239,68,68,0.08))',
        }}
      >
        <div className="flex items-center gap-2.5">
          {test.passed ? (
            <CheckCircle size={15} style={{ color: 'var(--success)' }} />
          ) : (
            <XCircle size={15} style={{ color: 'var(--error)' }} />
          )}
          <span className="text-sm font-semibold text-[var(--text)]">Test Case {index + 1}</span>
        </div>
        <Badge variant={test.passed ? 'success' : 'error'} size="sm">
          {test.passed ? 'PASS' : 'FAIL'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--borderMuted)]">
        <IOBlock label="Input" value={test.input} />
        <IOBlock label="Expected Output" value={test.expectedOutput ?? ''} />
        <IOBlock label="Actual Output" value={test.actualOutput} highlight={!test.passed} />
      </div>

      {test.errorInfo && (
        <div
          className="px-4 py-3 border-t"
          style={{
            background: 'var(--errorMuted, rgba(239,68,68,0.06))',
            borderColor: 'var(--error)',
          }}
        >
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--error)' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">{test.errorInfo.type}</span>
              {test.errorInfo.line != null && <span> (line {test.errorInfo.line})</span>}
              <span>: {test.errorInfo.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A test case from the paper that never ran — shown so the grading is visible. */
export function PlannedTestCaseCard({ index, test }: { index: number; test: TestCase }) {
  return (
    <div className="rounded-xl border border-[var(--borderMuted)] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bgSubtle)' }}
      >
        <span className="text-sm font-semibold text-[var(--text)]">Test Case {index + 1}</span>
        <Badge variant={test.isHidden ? 'secondary' : 'warning'} size="sm">
          {test.isHidden ? 'HIDDEN' : 'NOT RUN'}
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--borderMuted)]">
        <IOBlock label="Input" value={test.input} />
        <IOBlock label="Expected Output" value={test.expectedOutput} />
      </div>
    </div>
  );
}
