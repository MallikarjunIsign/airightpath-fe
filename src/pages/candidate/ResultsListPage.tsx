import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/services/assessment.service';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/utils/format.utils';
import type { Assessment } from '@/types/assessment.types';
import type { Result } from '@/types/result.types';

export function ResultsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      if (!user?.email) return;
      setLoading(true);
      try {
        // Fetch completed assessments as results source
        const res = await assessmentService.getCandidateAssessments(user.email);
        const assessments: Assessment[] = res.data ?? [];

        // Map completed assessments to results format
        const mappedResults: Result[] = assessments
          .filter((a) => a.examAttended)
          .map((a, index) => ({
            id: a.id ?? index,
            candidateEmail: a.candidateEmail,
            assessmentType: a.assessmentType,
            score: 0,
            jobPrefix: a.jobPrefix,
            createdAt: a.assignedAt,
          }));

        setResults(mappedResults);
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [user?.email]);

  const handleRowClick = (result: Result) => {
    navigate(`/candidate/results/${result.id}`, { state: { result } });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-[var(--text)]">My Results</h1>

      {results.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 mx-auto text-[var(--textTertiary)] mb-4" />
          <p className="text-lg font-medium text-[var(--text)]">No results yet</p>
          <p className="text-[var(--textSecondary)] mt-1">
            Complete assessments to see your results here.
          </p>
        </div>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Assessment Type
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Job
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Score
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    Date
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[var(--textSecondary)]">
                    {/* Action */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr
                    key={result.id}
                    onClick={() => handleRowClick(result)}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface1)] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <Badge
                        variant={result.assessmentType === 'APTITUDE' ? 'info' : 'warning'}
                        size="sm"
                      >
                        {result.assessmentType}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text)]">
                      {result.jobPrefix || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-[var(--text)]">
                        {result.score}
                        {result.totalMarks ? ` / ${result.totalMarks}` : ''}
                      </span>
                      {result.percentage !== undefined && (
                        <span className="text-xs text-[var(--textSecondary)] ml-2">
                          ({result.percentage}%)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--textSecondary)]">
                      {result.createdAt ? formatDate(result.createdAt) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <ChevronRight size={18} className="text-[var(--textTertiary)]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
