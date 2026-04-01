import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trophy,
  CheckCircle,
  XCircle,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import type { Result, ResultDetail } from '@/types/result.types';

export function ResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const stateResult = (location.state as { result?: Result })?.result;

  const [result, setResult] = useState<Result | null>(stateResult ?? null);
  const [details, setDetails] = useState<ResultDetail[]>([]);
  const [loading, setLoading] = useState(!stateResult);

  useEffect(() => {
    if (!result && !id) {
      showToast('No result data available.', 'error');
      navigate(ROUTES.CANDIDATE.RESULTS);
      return;
    }

    // Parse result details from resultsJson
    if (result?.resultsJson) {
      try {
        const parsed = JSON.parse(result.resultsJson);
        setDetails(Array.isArray(parsed) ? parsed : []);
      } catch {
        setDetails([]);
      }
    }
    setLoading(false);
  }, [result, id, navigate, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">Result not found.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.RESULTS)}>
          Back to Results
        </Button>
      </div>
    );
  }

  const correctCount = details.filter((d) => d.isCorrect).length;
  const totalQuestions = details.length;
  const percentage =
    result.percentage ??
    (totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(ROUTES.CANDIDATE.RESULTS)}
        leftIcon={<ArrowLeft size={18} />}
      >
        Back to Results
      </Button>

      {/* Overall Score Card */}
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Score Circle */}
            <div className="relative w-40 h-40 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="var(--surface2)"
                  strokeWidth="12"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke={percentage >= 50 ? 'var(--primary)' : 'var(--error)'}
                  strokeWidth="12"
                  strokeDasharray={`${(percentage / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[var(--text)]">{percentage}%</span>
                <span className="text-xs text-[var(--textSecondary)]">Score</span>
              </div>
            </div>

            {/* Score Details */}
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">Assessment Result</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant={result.assessmentType === 'APTITUDE' ? 'info' : 'warning'}
                  >
                    {result.assessmentType}
                  </Badge>
                  {result.jobPrefix && (
                    <Badge variant="secondary">{result.jobPrefix}</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-[var(--surface1)]">
                  <p className="text-xs text-[var(--textSecondary)]">Total Score</p>
                  <p className="text-lg font-bold text-[var(--text)]">
                    {result.score}
                    {result.totalMarks ? ` / ${result.totalMarks}` : ''}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface1)]">
                  <p className="text-xs text-[var(--textSecondary)]">Percentage</p>
                  <p className="text-lg font-bold text-[var(--text)]">{percentage}%</p>
                </div>
                {totalQuestions > 0 && (
                  <>
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <p className="text-xs text-green-600 dark:text-green-400">Correct</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {correctCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                      <p className="text-xs text-red-600 dark:text-red-400">Incorrect</p>
                      <p className="text-lg font-bold text-red-700 dark:text-red-300">
                        {totalQuestions - correctCount}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Question Breakdown */}
      {details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--primary)]" />
                Question-wise Breakdown
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {details.map((detail, index) => (
                <div
                  key={detail.questionId ?? index}
                  className={`p-4 rounded-lg border ${
                    detail.isCorrect
                      ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                      : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-[var(--textSecondary)]">
                          Q{index + 1}
                        </span>
                        {detail.isCorrect ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <Badge
                          variant={detail.isCorrect ? 'success' : 'error'}
                          size="sm"
                        >
                          {detail.marks} mark{detail.marks !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--text)] mb-3 whitespace-pre-wrap">
                        {detail.questionText}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-[var(--textSecondary)]">Your answer: </span>
                          <span
                            className={
                              detail.isCorrect
                                ? 'text-green-700 dark:text-green-400 font-medium'
                                : 'text-red-700 dark:text-red-400 font-medium'
                            }
                          >
                            {detail.selectedAnswer || '(Not answered)'}
                          </span>
                        </div>
                        {!detail.isCorrect && (
                          <div>
                            <span className="text-[var(--textSecondary)]">Correct answer: </span>
                            <span className="text-green-700 dark:text-green-400 font-medium">
                              {detail.correctAnswer}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {details.length === 0 && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <Trophy className="w-10 h-10 mx-auto text-[var(--textTertiary)] mb-3" />
              <p className="text-[var(--textSecondary)]">
                Detailed question breakdown is not available for this result.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Back Button */}
      <div className="flex justify-center pb-8">
        <Button variant="outline" onClick={() => navigate(ROUTES.CANDIDATE.RESULTS)}>
          Back to All Results
        </Button>
      </div>
    </div>
  );
}
