import { BookOpen, Code2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { CandidateStanding, ModuleStanding } from '@/utils/scoreboard.utils';

/**
 * What a candidate was set and how it went, in the width of a table cell.
 *
 * The pipeline stage says "Exam Sent" or "Exam Completed" and stops there — it
 * cannot say whether that was both papers or coding alone, nor what the
 * completed one came to. Both are what an admin is deciding on at this point,
 * and having to open each candidate's scorecard to learn them is what made this
 * screen unusable for a cohort.
 */
interface AssessmentStandingProps {
  standing?: CandidateStanding;
  /** The scoreboard is still loading, so absence isn't reported as fact. */
  loading?: boolean;
}

function ModuleLine({ label, module }: Readonly<{ label: string; module: ModuleStanding }>) {
  if (!module.assigned) return null;

  const isAptitude = label === 'Aptitude';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {isAptitude ? (
        <BookOpen size={12} className="flex-shrink-0" style={{ color: 'var(--info)' }} />
      ) : (
        <Code2 size={12} className="flex-shrink-0" style={{ color: '#a855f7' }} />
      )}
      <span className="text-xs font-medium text-[var(--textSecondary)]">{label}</span>

      {module.attempts > 1 && (
        <span
          className="text-[10px] font-semibold text-[var(--warning)]"
          title={`Set ${module.attempts} times`}
        >
          ×{module.attempts}
        </span>
      )}

      {/* Sat but unscorable is its own state: the paper it was graded against
          could not be read, and "--" says that where a 0% would accuse the
          candidate of something they did not do. */}
      {module.sat && module.score !== null && (
        <span
          className="text-xs font-bold text-[var(--text)]"
          title={`Pass mark ${module.passMark}%`}
        >
          {module.score}%
        </span>
      )}
      {module.sat && module.score === null && (
        <span className="text-xs font-bold text-[var(--textTertiary)]" title="Score unavailable">
          --
        </span>
      )}

      {module.verdict && (
        <Badge variant={module.verdict === 'PASSED' ? 'success' : 'error'} size="sm">
          {module.verdict}
        </Badge>
      )}
      {!module.sat && (
        <Badge variant="warning" size="sm">
          Not sat
        </Badge>
      )}
    </div>
  );
}

export function AssessmentStanding({ standing, loading }: Readonly<AssessmentStandingProps>) {
  if (loading && !standing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--textTertiary)]">
        <Loader2 size={12} className="animate-spin" />
        Loading
      </span>
    );
  }

  if (!standing?.aptitude.assigned && !standing?.coding.assigned) {
    return <span className="text-xs text-[var(--textTertiary)]">No exam set</span>;
  }

  return (
    <div className="space-y-1">
      <ModuleLine label="Aptitude" module={standing.aptitude} />
      <ModuleLine label="Coding" module={standing.coding} />

      {/* The overall only earns its line once both papers are in — repeating a
          single module's percentage under it says nothing new. */}
      {standing.overallScore !== null &&
        standing.aptitude.assigned &&
        standing.coding.assigned && (
          <p className="text-[10px] text-[var(--textTertiary)] pt-0.5">
            Overall <span className="font-bold text-[var(--text)]">{standing.overallScore}%</span>
            {standing.overallStatus !== 'PARTIAL' && (
              <span
                className={`ml-1 font-semibold ${
                  standing.overallStatus === 'PASSED'
                    ? 'text-[var(--success)]'
                    : 'text-[var(--error)]'
                }`}
              >
                {standing.overallStatus}
              </span>
            )}
          </p>
        )}
    </div>
  );
}
