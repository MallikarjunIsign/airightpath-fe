import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Code2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  BarChart3,
  FileCode,
  AlertTriangle,
  Award,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import type { Result } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

// ── Types ──────────────────────────────────────────────────────────────

interface AptitudeQuestion {
  questionId?: number;
  questionText?: string;
  question?: string;
  selectedAnswer?: string;
  correctAnswer?: string;
  isCorrect?: boolean;
  marks?: number;
  Difficulty?: string;
  category?: string;
}

type DetailTab = 'overview' | 'aptitude' | 'coding';

// ── Helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--error)';
}

function statusVariant(status?: string): 'success' | 'error' | 'warning' {
  if (status === 'PASSED') return 'success';
  if (status === 'FAILED') return 'error';
  return 'warning';
}

// ── Main Page ──────────────────────────────────────────────────────────

export function CandidateResultDetailPage() {
  const { jobPrefix, email } = useParams<{ jobPrefix: string; email: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmissionResponse[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  useEffect(() => {
    if (jobPrefix && email) fetchData();
  }, [jobPrefix, email]);

  async function fetchData() {
    setLoading(true);
    try {
      const [resResults, resCode] = await Promise.all([
        assessmentService.getResultsByEmailAndJobPrefix(email!, jobPrefix!),
        compilerService.getResultsByJobPrefix(jobPrefix!),
      ]);
      setResults(resResults.data ?? []);
      const allCode = resCode.data ?? [];
      setCodeSubmissions(allCode.filter((c) => c.userEmail === email));
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }

  const aptitudeResult = results.find((r) => r.assessmentType === 'APTITUDE');
  const codingResult = results.find((r) => r.assessmentType === 'CODING');

  const aptitudeQuestions: AptitudeQuestion[] = useMemo(() => {
    if (!aptitudeResult?.resultsJson) return [];
    try {
      return JSON.parse(aptitudeResult.resultsJson);
    } catch {
      return [];
    }
  }, [aptitudeResult]);

  const codingStats = useMemo(() => {
    const totalQ = codeSubmissions.length;
    const totalTests = codeSubmissions.reduce((s, sub) => s + (sub.testResults?.length ?? 0), 0);
    const passedTests = codeSubmissions.reduce(
      (s, sub) => s + (sub.testResults?.filter((t) => t.passed).length ?? 0),
      0,
    );
    const qPassed = codeSubmissions.filter(
      (s) => s.testResults?.length > 0 && s.testResults.every((t) => t.passed),
    ).length;
    return { totalQ, totalTests, passedTests, qPassed };
  }, [codeSubmissions]);

  const overallStatus = (() => {
    const a = aptitudeResult?.status;
    const c = codingResult?.status;
    if (a === 'PASSED' && c === 'PASSED') return 'PASSED';
    if (a === 'FAILED' || c === 'FAILED') return 'FAILED';
    return 'PENDING';
  })();

  const overallScore = (() => {
    const scores: number[] = [];
    if (aptitudeResult) scores.push(aptitudeResult.score);
    if (codingResult) scores.push(codingResult.score);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  })();

  const hasAptitude = !!aptitudeResult;
  const hasCoding = !!codingResult || codeSubmissions.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* ── Back nav ──────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate(ROUTES.ADMIN.ASSESSMENTS_RESULTS)}
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--textSecondary)] hover:text-[var(--primary)] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Assessment Results
      </button>

      {/* ── Candidate Header ─────────────────────────────────────────── */}
      <Card variant="elevated">
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
              >
                {(email ?? '?')[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)] font-heading">{email}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-[var(--textSecondary)]">
                    Job: <span className="font-semibold text-[var(--text)]">{jobPrefix}</span>
                  </span>
                  <span className="text-[var(--borderStrong)]">|</span>
                  <span className="text-sm text-[var(--textSecondary)]">
                    Submitted:{' '}
                    <span className="font-medium text-[var(--text)]">
                      {aptitudeResult?.submittedAt
                        ? new Date(aptitudeResult.submittedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '--'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <Badge variant={statusVariant(overallStatus)} size="lg">
              {overallStatus}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Score Tiles ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          icon={<Award size={20} />}
          iconColor="var(--primary)"
          label="Overall Score"
          chart={<RadialScore score={overallScore} size={80} stroke={8} />}
        />
        <KpiTile
          icon={<BookOpen size={20} />}
          iconColor="var(--info)"
          label="Aptitude"
          chart={
            aptitudeResult ? (
              <RadialScore score={aptitudeResult.score} size={80} stroke={8} />
            ) : (
              <KpiPlaceholder text="N/A" />
            )
          }
        />
        <KpiTile
          icon={<Code2 size={20} />}
          iconColor="#a855f7"
          label="Coding"
          chart={
            codingResult ? (
              <RadialScore score={codingResult.score} size={80} stroke={8} />
            ) : codeSubmissions.length > 0 ? (
              <KpiValue value={`${codingStats.qPassed}/${codingStats.totalQ}`} sub="Q Passed" />
            ) : (
              <KpiPlaceholder text="N/A" />
            )
          }
        />
        <KpiTile
          icon={<Target size={20} />}
          iconColor="var(--warning)"
          label="Test Cases"
          chart={
            <KpiValue value={`${codingStats.passedTests}/${codingStats.totalTests}`} sub="Passed" />
          }
        />
        <KpiTile
          icon={<Clock size={20} />}
          iconColor="var(--textTertiary)"
          label="Submitted"
          chart={
            <KpiValue
              value={
                aptitudeResult?.submittedAt
                  ? new Date(aptitudeResult.submittedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '--'
              }
              sub={
                aptitudeResult?.submittedAt
                  ? new Date(aptitudeResult.submittedAt).getFullYear().toString()
                  : ''
              }
            />
          }
        />
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────── */}
      <div className="flex gap-1 p-1.5 rounded-2xl bg-[var(--bgSubtle)] border border-[var(--borderMuted)]">
        {(['overview', 'aptitude', 'coding'] as DetailTab[]).map((tab) => {
          const disabled =
            (tab === 'aptitude' && !hasAptitude) || (tab === 'coding' && !hasCoding);
          const isActive = activeTab === tab;
          const icon =
            tab === 'overview' ? (
              <BarChart3 size={15} />
            ) : tab === 'aptitude' ? (
              <BookOpen size={15} />
            ) : (
              <FileCode size={15} />
            );
          return (
            <button
              key={tab}
              disabled={disabled}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200
                ${isActive ? 'bg-[var(--primary)] text-white shadow-sm' : ''}
                ${!isActive && !disabled ? 'text-[var(--textSecondary)] hover:text-[var(--text)] hover:bg-[var(--bgMuted)]' : ''}
                ${disabled ? 'text-[var(--textQuaternary)] cursor-not-allowed' : ''}
              `}
            >
              {icon}
              <span className="capitalize">{tab}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          aptitude={aptitudeResult}
          coding={codingResult}
          aptitudeQuestions={aptitudeQuestions}
          codingStats={codingStats}
          submissions={codeSubmissions}
        />
      )}
      {activeTab === 'aptitude' && aptitudeResult && (
        <AptitudeTab result={aptitudeResult} questions={aptitudeQuestions} />
      )}
      {activeTab === 'coding' && (
        <CodingTab result={codingResult} submissions={codeSubmissions} />
      )}
    </div>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────

function KpiTile({
  icon,
  iconColor,
  label,
  chart,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  chart: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-2">
          {chart}
          <div className="flex items-center gap-1.5">
            <span style={{ color: iconColor }}>{icon}</span>
            <span className="text-xs font-semibold text-[var(--textSecondary)]">{label}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiPlaceholder({ text }: { text: string }) {
  return (
    <div className="w-20 h-20 rounded-full border-[6px] border-[var(--borderMuted)] flex items-center justify-center">
      <span className="text-sm font-semibold text-[var(--textTertiary)]">{text}</span>
    </div>
  );
}

function KpiValue({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="w-20 h-20 flex flex-col items-center justify-center">
      <span className="text-2xl font-bold text-[var(--text)]">{value}</span>
      {sub && <span className="text-[10px] font-medium text-[var(--textTertiary)] mt-0.5">{sub}</span>}
    </div>
  );
}

// ── Radial Score Component (SVG donut) ─────────────────────────────────

function RadialScore({
  score,
  size = 80,
  stroke = 8,
}: {
  score: number;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bgWash)"
          strokeWidth={stroke}
        />
        {/* Score arc */}
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
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-[var(--text)]">{score}%</span>
      </div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab({
  aptitude,
  coding,
  aptitudeQuestions,
  codingStats,
  submissions,
}: {
  aptitude?: Result;
  coding?: Result;
  aptitudeQuestions: AptitudeQuestion[];
  codingStats: { totalQ: number; totalTests: number; passedTests: number; qPassed: number };
  submissions: CodeSubmissionResponse[];
}) {
  const categoryBreakdown = useMemo(() => {
    if (aptitudeQuestions.length === 0) return [];
    const cats = new Map<string, { total: number; correct: number }>();
    for (const q of aptitudeQuestions) {
      const cat = q.Difficulty || q.category || 'General';
      if (!cats.has(cat)) cats.set(cat, { total: 0, correct: 0 });
      const c = cats.get(cat)!;
      c.total++;
      if (q.isCorrect) c.correct++;
    }
    return Array.from(cats.entries()).map(([name, { total, correct }]) => ({
      name,
      total,
      correct,
      pct: Math.round((correct / total) * 100),
    }));
  }, [aptitudeQuestions]);

  const languageBreakdown = useMemo(() => {
    const langs = new Map<string, number>();
    for (const s of submissions) {
      const lang = s.language || 'Unknown';
      langs.set(lang, (langs.get(lang) ?? 0) + 1);
    }
    return Array.from(langs.entries());
  }, [submissions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Aptitude Summary Card */}
      {aptitude && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--infoMuted, rgba(6,182,212,0.12))' }}>
                <BookOpen size={16} style={{ color: 'var(--info)' }} />
              </div>
              <CardTitle>Aptitude Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {/* Score + status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <RadialScore score={aptitude.score} size={64} stroke={7} />
                  <div>
                    <p className="text-xl font-bold text-[var(--text)]">{aptitude.score}%</p>
                    <Badge variant={statusVariant(aptitude.status)} size="sm">
                      {aptitude.status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--textTertiary)] uppercase tracking-wider font-medium">Questions</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{aptitudeQuestions.length}</p>
                </div>
              </div>

              {/* Stat pills */}
              <div className="flex gap-3">
                <StatPill
                  value={aptitudeQuestions.filter((q) => q.isCorrect).length}
                  label="Correct"
                  variant="success"
                />
                <StatPill
                  value={aptitudeQuestions.filter((q) => !q.isCorrect).length}
                  label="Incorrect"
                  variant="error"
                />
              </div>

              {/* Category bars */}
              {categoryBreakdown.length > 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Performance by Category
                  </p>
                  {categoryBreakdown.map((cat) => (
                    <SkillBar key={cat.name} label={cat.name} percentage={cat.pct} detail={`${cat.correct}/${cat.total}`} />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coding Summary Card */}
      {(coding || submissions.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.12)' }}>
                <Code2 size={16} style={{ color: '#a855f7' }} />
              </div>
              <CardTitle>Coding Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {/* Score + status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {coding ? (
                    <RadialScore score={coding.score} size={64} stroke={7} />
                  ) : (
                    <div className="w-16 h-16 rounded-full border-[5px] border-[var(--borderMuted)] flex items-center justify-center">
                      <Code2 size={22} className="text-[var(--textTertiary)]" />
                    </div>
                  )}
                  <div>
                    {coding ? (
                      <>
                        <p className="text-xl font-bold text-[var(--text)]">{coding.score}%</p>
                        <Badge variant={statusVariant(coding.status)} size="sm">
                          {coding.status}
                        </Badge>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-[var(--text)]">Submitted</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--textTertiary)] uppercase tracking-wider font-medium">Questions</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{codingStats.totalQ}</p>
                </div>
              </div>

              {/* Stat pills */}
              <div className="flex gap-3">
                <StatPill value={codingStats.qPassed} label="Q Passed" variant="success" />
                <StatPill
                  value={`${codingStats.passedTests}/${codingStats.totalTests}`}
                  label="Test Cases"
                  variant="info"
                />
                <StatPill
                  value={
                    codingStats.totalTests > 0
                      ? `${Math.round((codingStats.passedTests / codingStats.totalTests) * 100)}%`
                      : '0%'
                  }
                  label="Pass Rate"
                  variant="primary"
                />
              </div>

              {/* Language breakdown */}
              {languageBreakdown.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Languages Used
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {languageBreakdown.map(([lang, count]) => (
                      <Badge key={lang} variant="primary" size="sm">
                        {lang} ({count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-question quick grid */}
              {submissions.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Question Results
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {submissions.map((sub, idx) => {
                      const allPass =
                        sub.testResults?.length > 0 && sub.testResults.every((t) => t.passed);
                      return (
                        <div
                          key={sub.questionId ?? idx}
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold border transition-colors"
                          style={{
                            background: allPass
                              ? 'var(--successMuted, rgba(16,185,129,0.12))'
                              : 'var(--errorMuted, rgba(239,68,68,0.12))',
                            borderColor: allPass ? 'var(--success)' : 'var(--error)',
                            color: allPass ? 'var(--success)' : 'var(--error)',
                            opacity: 0.9,
                          }}
                          title={`Q${sub.questionId ?? idx + 1}: ${allPass ? 'Passed' : 'Failed'}`}
                        >
                          Q{sub.questionId ?? idx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────

function StatPill({
  value,
  label,
  variant,
}: {
  value: number | string;
  label: string;
  variant: 'success' | 'error' | 'info' | 'primary' | 'warning';
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    success: { bg: 'var(--successMuted, rgba(16,185,129,0.12))', text: 'var(--success)' },
    error: { bg: 'var(--errorMuted, rgba(239,68,68,0.12))', text: 'var(--error)' },
    info: { bg: 'var(--infoMuted, rgba(6,182,212,0.12))', text: 'var(--info)' },
    primary: { bg: 'var(--primaryMuted, rgba(16,185,129,0.12))', text: 'var(--primary)' },
    warning: { bg: 'var(--warningMuted, rgba(245,158,11,0.12))', text: 'var(--warning)' },
  };
  const colors = colorMap[variant];

  return (
    <div
      className="flex-1 text-center py-3 px-2 rounded-xl border transition-colors"
      style={{
        background: colors.bg,
        borderColor: 'transparent',
      }}
    >
      <p className="text-lg font-bold" style={{ color: colors.text }}>
        {value}
      </p>
      <p className="text-[10px] font-semibold mt-0.5" style={{ color: colors.text, opacity: 0.7 }}>
        {label}
      </p>
    </div>
  );
}

// ── Skill Bar ──────────────────────────────────────────────────────────

function SkillBar({ label, percentage, detail }: { label: string; percentage: number; detail: string }) {
  const color = scoreColor(percentage);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-[var(--text)]">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>
          {percentage}%{' '}
          <span className="text-[var(--textTertiary)] font-normal">({detail})</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bgWash)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Aptitude Tab ───────────────────────────────────────────────────────

function AptitudeTab({ result, questions }: { result: Result; questions: AptitudeQuestion[] }) {
  const correct = questions.filter((q) => q.isCorrect).length;
  const incorrect = questions.length - correct;

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-[var(--textSecondary)] py-8">
            No detailed breakdown available for this assessment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <Card variant="elevated">
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <RadialScore score={result.score} size={56} stroke={7} />
              <div>
                <p className="text-xl font-bold text-[var(--text)]">{result.score}%</p>
                <Badge variant={statusVariant(result.status)} size="sm">{result.status}</Badge>
              </div>
            </div>
            <div className="h-10 w-px bg-[var(--borderMuted)]" />
            <div className="flex flex-wrap gap-5 text-sm">
              <span className="text-[var(--textSecondary)]">
                Total: <strong className="text-[var(--text)]">{questions.length}</strong>
              </span>
              <span style={{ color: 'var(--success)' }}>
                Correct: <strong>{correct}</strong>
              </span>
              <span style={{ color: 'var(--error)' }}>
                Incorrect: <strong>{incorrect}</strong>
              </span>
              <span className="text-[var(--textSecondary)]">
                Accuracy:{' '}
                <strong className="text-[var(--text)]">
                  {Math.round((correct / questions.length) * 100)}%
                </strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question list */}
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <Card key={q.questionId ?? idx}>
            <CardContent>
              <div className="flex items-start gap-4">
                {/* Number badge */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: q.isCorrect
                      ? 'var(--successMuted, rgba(16,185,129,0.12))'
                      : 'var(--errorMuted, rgba(239,68,68,0.12))',
                    color: q.isCorrect ? 'var(--success)' : 'var(--error)',
                  }}
                >
                  {idx + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text)] leading-relaxed">
                    {q.questionText || q.question || `Question ${idx + 1}`}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--textTertiary)]">Selected:</span>
                      <span
                        className="font-semibold px-2.5 py-1 rounded-lg"
                        style={{
                          background: q.isCorrect
                            ? 'var(--successMuted, rgba(16,185,129,0.12))'
                            : 'var(--errorMuted, rgba(239,68,68,0.12))',
                          color: q.isCorrect ? 'var(--success)' : 'var(--error)',
                        }}
                      >
                        {q.selectedAnswer ?? '--'}
                      </span>
                    </div>

                    {!q.isCorrect && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--textTertiary)]">Correct:</span>
                        <span
                          className="font-semibold px-2.5 py-1 rounded-lg"
                          style={{
                            background: 'var(--successMuted, rgba(16,185,129,0.12))',
                            color: 'var(--success)',
                          }}
                        >
                          {q.correctAnswer ?? '--'}
                        </span>
                      </div>
                    )}

                    {q.marks !== undefined && (
                      <span className="text-[var(--textTertiary)]">
                        Marks: <strong className="text-[var(--text)]">{q.marks}</strong>
                      </span>
                    )}

                    {(q.Difficulty || q.category) && (
                      <Badge variant="primary" size="sm">
                        {q.Difficulty || q.category}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Status icon */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: q.isCorrect
                      ? 'var(--successMuted, rgba(16,185,129,0.12))'
                      : 'var(--errorMuted, rgba(239,68,68,0.12))',
                  }}
                >
                  {q.isCorrect ? (
                    <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                  ) : (
                    <XCircle size={16} style={{ color: 'var(--error)' }} />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Coding Tab ─────────────────────────────────────────────────────────

function CodingTab({
  result,
  submissions,
}: {
  result?: Result;
  submissions: CodeSubmissionResponse[];
}) {
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-[var(--textSecondary)] py-8">
            No coding submissions found.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalTests = submissions.reduce((s, sub) => s + (sub.testResults?.length ?? 0), 0);
  const passedTests = submissions.reduce(
    (s, sub) => s + (sub.testResults?.filter((t) => t.passed).length ?? 0),
    0,
  );
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <Card variant="elevated">
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            {result && (
              <>
                <div className="flex items-center gap-4">
                  <RadialScore score={result.score} size={56} stroke={7} />
                  <div>
                    <p className="text-xl font-bold text-[var(--text)]">{result.score}%</p>
                    <Badge variant={statusVariant(result.status)} size="sm">{result.status}</Badge>
                  </div>
                </div>
                <div className="h-10 w-px bg-[var(--borderMuted)]" />
              </>
            )}
            <div className="flex flex-wrap gap-5 text-sm">
              <span className="text-[var(--textSecondary)]">
                Questions: <strong className="text-[var(--text)]">{submissions.length}</strong>
              </span>
              <span style={{ color: 'var(--success)' }}>
                Test Cases: <strong>{passedTests}/{totalTests}</strong>
              </span>
              {totalTests > 0 && (
                <span className="text-[var(--textSecondary)]">
                  Pass Rate:{' '}
                  <strong style={{ color: scoreColor(passRate) }}>{passRate}%</strong>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-question cards */}
      <div className="space-y-3">
        {submissions.map((sub, idx) => {
          const qId = sub.questionId ?? `q-${idx}`;
          const isExpanded = expandedQ === qId;
          const tests = sub.testResults ?? [];
          const allPass = tests.length > 0 && tests.every((t) => t.passed);
          const passCount = tests.filter((t) => t.passed).length;

          return (
            <Card key={qId}>
              {/* Question Header — clickable */}
              <button
                onClick={() => setExpandedQ(isExpanded ? null : qId)}
                className="w-full text-left transition-colors"
              >
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                        style={{
                          background: allPass
                            ? 'var(--successMuted, rgba(16,185,129,0.12))'
                            : 'var(--errorMuted, rgba(239,68,68,0.12))',
                          color: allPass ? 'var(--success)' : 'var(--error)',
                        }}
                      >
                        Q{sub.questionId ?? idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          Question {sub.questionId ?? idx + 1}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="primary" size="sm">{sub.language}</Badge>
                          <Badge variant={allPass ? 'success' : 'error'} size="sm">
                            {passCount}/{tests.length} passed
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          background: allPass
                            ? 'var(--successMuted, rgba(16,185,129,0.12))'
                            : 'var(--errorMuted, rgba(239,68,68,0.12))',
                        }}
                      >
                        {allPass ? (
                          <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                        ) : (
                          <XCircle size={16} style={{ color: 'var(--error)' }} />
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={18} className="text-[var(--textTertiary)]" />
                      ) : (
                        <ChevronDown size={18} className="text-[var(--textTertiary)]" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-6 pb-6 space-y-5 border-t border-[var(--borderMuted)]">
                  {/* Code Viewer */}
                  {sub.script && (
                    <div className="mt-5">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                          Submitted Code
                        </p>
                        <Badge variant="primary" size="sm">{sub.language}</Badge>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-[var(--borderMuted)]">
                        <div
                          className="px-5 py-3 text-xs font-semibold flex items-center gap-2 border-b border-[var(--borderMuted)]"
                          style={{ background: 'var(--bgSubtle)', color: 'var(--textSecondary)' }}
                        >
                          <Zap size={12} />
                          {sub.language}
                        </div>
                        <pre
                          className="text-[13px] leading-6 p-5 overflow-x-auto max-h-[400px] overflow-y-auto font-mono"
                          style={{
                            background: 'var(--bgMuted)',
                            color: 'var(--text)',
                          }}
                        >
                          <code>
                            {sub.script.split('\n').map((line, i) => (
                              <div key={i} className="flex hover:bg-[var(--bgSubtle)] -mx-5 px-5 transition-colors">
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
                    </div>
                  )}

                  {/* Test Case Results */}
                  {tests.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest mb-3">
                        Test Case Results
                      </p>
                      <div className="space-y-3">
                        {tests.map((tc, tIdx) => (
                          <div
                            key={tIdx}
                            className="rounded-xl border overflow-hidden"
                            style={{
                              borderColor: tc.passed ? 'var(--success)' : 'var(--error)',
                              borderWidth: '1px',
                            }}
                          >
                            {/* Test case header */}
                            <div
                              className="flex items-center justify-between px-4 py-3"
                              style={{
                                background: tc.passed
                                  ? 'var(--successMuted, rgba(16,185,129,0.08))'
                                  : 'var(--errorMuted, rgba(239,68,68,0.08))',
                              }}
                            >
                              <div className="flex items-center gap-2.5">
                                {tc.passed ? (
                                  <CheckCircle size={15} style={{ color: 'var(--success)' }} />
                                ) : (
                                  <XCircle size={15} style={{ color: 'var(--error)' }} />
                                )}
                                <span className="text-sm font-semibold text-[var(--text)]">
                                  Test Case {tIdx + 1}
                                </span>
                              </div>
                              <Badge variant={tc.passed ? 'success' : 'error'} size="sm">
                                {tc.passed ? 'PASS' : 'FAIL'}
                              </Badge>
                            </div>

                            {/* IO details */}
                            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--borderMuted)]">
                              <IOBlock label="Input" value={tc.input} />
                              <IOBlock label="Expected Output" value={tc.expectedOutput ?? ''} />
                              <IOBlock
                                label="Actual Output"
                                value={tc.actualOutput}
                                highlight={!tc.passed}
                              />
                            </div>

                            {/* Error info */}
                            {tc.errorInfo && (
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
                                    <span className="font-bold">{tc.errorInfo.type}</span>
                                    {tc.errorInfo.line != null && (
                                      <span> (line {tc.errorInfo.line})</span>
                                    )}
                                    <span>: {tc.errorInfo.message}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── IO Block ───────────────────────────────────────────────────────────

function IOBlock({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="px-4 py-3" style={{ background: 'var(--bgSubtle)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--textTertiary)' }}>
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
