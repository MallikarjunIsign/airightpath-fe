import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { InterviewEvaluation } from '@/types/interview.types';

interface EvaluationBreakdownProps {
  evaluation: InterviewEvaluation;
}

function getRecommendationVariant(rec: string): 'success' | 'warning' | 'error' | 'info' {
  switch (rec) {
    case 'STRONG_HIRE':
      return 'success';
    case 'HIRE':
      return 'info';
    case 'NO_HIRE':
      return 'warning';
    case 'STRONG_NO_HIRE':
      return 'error';
    default:
      return 'warning';
  }
}

function getScoreVariant(score: number): 'success' | 'warning' | 'error' | 'primary' {
  if (score >= 8) return 'success';
  if (score >= 6) return 'primary';
  if (score >= 4) return 'warning';
  return 'error';
}

export function EvaluationBreakdown({ evaluation }: EvaluationBreakdownProps) {
  return (
    <div className="space-y-6">
      {/* Overall Score & Recommendation */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--textSecondary)]">Overall Score:</span>
          <span className="text-2xl font-bold text-[var(--text)]">
            {(evaluation.overallScore ?? 0).toFixed(1)}
          </span>
          <span className="text-sm text-[var(--textTertiary)]">/ 10</span>
        </div>
        <Badge variant={getRecommendationVariant(evaluation.recommendation ?? '')} size="sm">
          {(evaluation.recommendation ?? '').replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Category Scores */}
      {evaluation.categoryScores.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-[var(--text)]">Category Breakdown</h4>
          {evaluation.categoryScores.map((cat) => (
            <div key={cat.categoryName} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text)]">
                  {cat.categoryName}
                  <span className="text-xs text-[var(--textTertiary)] ml-1">
                    ({cat.weight}%)
                  </span>
                </span>
                <span className="text-sm font-semibold text-[var(--text)] tabular-nums">
                  {cat.score}/10
                </span>
              </div>
              <ProgressBar
                value={cat.score}
                max={10}
                size="sm"
                variant={getScoreVariant(cat.score)}
              />
              {cat.feedback && (
                <p className="text-xs text-[var(--textSecondary)] leading-relaxed">
                  {cat.feedback}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall Feedback */}
      {evaluation.overallFeedback && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text)]">Overall Feedback</h4>
          <p className="text-sm text-[var(--textSecondary)] leading-relaxed whitespace-pre-wrap">
            {evaluation.overallFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
