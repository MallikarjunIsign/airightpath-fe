import { useState, useEffect, useMemo, useCallback } from 'react';
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
  FileText,
  ListChecks,
  HelpCircle,
  Percent,
  TrendingDown,
  Terminal,
  Download,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { assessmentService } from '@/services/assessment.service';
import { extractApiError } from '@/services/api.service';
import { compilerService } from '@/services/compiler.service';
import {
  RadialScore,
  SummaryStat,
  SkillBar,
  FilterChips,
  MiniButton,
  OutcomeIcon,
} from '@/components/admin/result/ResultPrimitives';
import { AptitudeBandCards, CodingBandCards } from '@/components/admin/result/BandCards';
import { CodeBlock, IOBlock } from '@/components/admin/result/CodeBlock';
import { TestCaseCard, PlannedTestCaseCard } from '@/components/admin/result/TestCaseCard';
import {
  AptitudePaperModal,
  CodingPaperModal,
  SubmittedCodeModal,
  TestOutputModal,
} from '@/components/admin/result/ResultModals';
import { ProctoringCaptures } from '@/components/admin/result/ProctoringCaptures';
import { AnswerSheetExportDialog } from '@/components/admin/result/AnswerSheetExportDialog';
import { QuestionPaperExportDialog } from '@/components/admin/QuestionPaperExportDialog';
import type { AnswerSheetData } from '@/utils/answer-sheet.utils';
import {
  statusVariant,
  aptitudeScorePercent,
  codingScorePercent,
  overallScorePercent,
  OUTCOME,
  answerOutcome,
  codingOutcome,
  formatDurationBetween,
  buildCodingRows,
  summarizeCoding,
  summarizeAptitude,
  groupAptitudeByBand,
  groupCodingByBand,
  codingAreasToImprove,
  aptitudeAreasToImprove,
  isAnswered,
  isRowSolved,
  isRowAttempted,
  testsOf,
  passedTestCount,
  rowTitle,
  rowLanguage,
  codeOf,
  normalizeBand,
  splitResultsJson,
} from '@/utils/result.utils';
import { SubmissionInfo } from '@/components/result/SubmissionInfo';
import type { CodingRow } from '@/utils/result.utils';
import type { Result, AptitudeAnswer, CodingAnswer, SubmissionMeta } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';
import type { Assessment, RawCodingQuestion, RawQuestion } from '@/types/assessment.types';

// ── Types ──────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'aptitude' | 'coding';
type AptitudeFilter = 'all' | 'correct' | 'incorrect' | 'unanswered';
type CodingFilter = 'all' | 'solved' | 'failed' | 'skipped';

/** Timing pulled off the assessment record, per assessment type. */
interface ExamWindows {
  aptitude?: string | null;
  coding?: string | null;
}

/**
 * Assessment ids per type. Proctoring captures are keyed by attempt, so the
 * aptitude tab can only show the aptitude photo once we know which attempt it
 * belongs to.
 */
interface AssessmentIds {
  aptitude?: number;
  coding?: number;
}

const ALL_BANDS = '__all__';

/** Best-effort parse of a `resultsJson` / question-paper payload into an array. */
function parseArray<T>(raw: unknown): T[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// ── Main Page ──────────────────────────────────────────────────────────

export function CandidateResultDetailPage() {
  const { jobPrefix, email } = useParams<{ jobPrefix: string; email: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmissionResponse[]>([]);
  const [codingQuestions, setCodingQuestions] = useState<RawCodingQuestion[]>([]);
  const [aptitudePaper, setAptitudePaper] = useState<RawQuestion[]>([]);
  const [examWindows, setExamWindows] = useState<ExamWindows>({});
  const [assessmentIds, setAssessmentIds] = useState<AssessmentIds>({});
  /** Why the assessment lookup failed, when it did — see fetchPapers. */
  const [papersError, setPapersError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [exportingSheet, setExportingSheet] = useState(false);

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
      fetchPapers();
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }

  /**
   * The question papers and the exam window live on the candidate's assessment
   * records, not on the result, so pull them separately. Best-effort: every view
   * degrades to what the result itself stores if this fails.
   */
  async function fetchPapers() {
    try {
      setPapersError(null);
      // Deliberately NOT getCandidateAssessments: that endpoint filters to
      // examAttended = false, and this page only exists because the candidate
      // sat the exam. It returned an empty list every time, which read as
      // "no assessment record" and cost us both the paper and the captures.
      const res = await assessmentService.getAllAssessmentsForCandidate(email!);
      // Tolerate both a bare array and an { data: [...] } envelope — the same
      // defence the rest of this codebase applies to list endpoints. Calling
      // .filter on an envelope throws, and the catch below would then report a
      // lookup failure for what is really a shape mismatch.
      const body = res.data as unknown;
      let list: Assessment[] = [];
      if (Array.isArray(body)) {
        list = body;
      } else if (Array.isArray((body as { data?: unknown })?.data)) {
        list = (body as { data: Assessment[] }).data;
      }

      const mine = list.filter((a) => a.jobPrefix === jobPrefix);
      const aptitude = mine.find((a) => a.assessmentType === 'APTITUDE');
      const coding = mine.find((a) => a.assessmentType === 'CODING');

      setExamWindows({
        aptitude: formatDurationBetween(aptitude?.startTime, aptitude?.deadline),
        coding: formatDurationBetween(coding?.startTime, coding?.deadline),
      });
      setAssessmentIds({ aptitude: aptitude?.id, coding: coding?.id });

      const [aptPaper, codePaper] = await Promise.all([
        aptitude?.id ? assessmentService.fetchQuestions(aptitude.id).catch(() => null) : null,
        coding?.id ? assessmentService.fetchQuestions(coding.id).catch(() => null) : null,
      ]);

      setAptitudePaper(parseArray<RawQuestion>(aptPaper?.data?.questions));
      setCodingQuestions(parseArray<RawCodingQuestion>(codePaper?.data?.questions));
    } catch (err) {
      // The papers themselves are optional context, but this same call is what
      // supplies the assessment ids the capture cards are keyed on. Swallowing
      // it made a failed lookup look identical to "this candidate has no
      // assessment record", which is a different problem with a different fix.
      setPapersError(extractApiError(err).message);
    }
  }

  const aptitudeResult = results.find((r) => r.assessmentType === 'APTITUDE');
  const codingResult = results.find((r) => r.assessmentType === 'CODING');

  // `resultsJson` holds the answers plus, at the end, the record of how the
  // attempt was submitted — split so the metadata is never scored as an answer.
  const aptitudeParsed = useMemo(
    () => splitResultsJson<AptitudeAnswer>(aptitudeResult?.resultsJson),
    [aptitudeResult],
  );
  const aptitudeAnswers = aptitudeParsed.answers;

  // The CODING result carries one entry per question on the paper — including
  // the ones never opened — so it, not the compiler submissions, defines the list.
  const codingParsed = useMemo(
    () => splitResultsJson<CodingAnswer>(codingResult?.resultsJson),
    [codingResult],
  );
  const codingAnswers = codingParsed.answers;

  const codingRows = useMemo(
    () => buildCodingRows(codingQuestions, codeSubmissions, codingAnswers),
    [codingQuestions, codeSubmissions, codingAnswers],
  );

  // Counted off the question paper so unattempted questions are part of the
  // totals, not just the ones that were submitted.
  const codingStats = useMemo(() => summarizeCoding(codingRows), [codingRows]);

  /**
   * When this candidate submitted, from whichever module they sat.
   *
   * Reading only the aptitude result showed "--" for anyone assigned coding
   * alone — they had submitted, the page just looked in one place. The answer
   * sheet export already fell back like this; the screen did not.
   */
  const submittedAt = aptitudeResult?.submittedAt ?? codingResult?.submittedAt;

  const overallStatus = (() => {
    const a = aptitudeResult?.status;
    const c = codingResult?.status;
    if (a === 'PASSED' && c === 'PASSED') return 'PASSED';
    if (a === 'FAILED' || c === 'FAILED') return 'FAILED';
    return 'PENDING';
  })();

  // `Result.score` is raw marks for aptitude and a hard-coded 0 for coding, so
  // both modules are converted to real percentages before anything is averaged
  // — see the scoring notes in result.utils.ts.
  const aptitudeScore = useMemo(
    () => aptitudeScorePercent(aptitudeResult, aptitudeAnswers, aptitudePaper),
    [aptitudeResult, aptitudeAnswers, aptitudePaper],
  );
  const codingScore = useMemo(
    () => codingScorePercent(codingRows, codingResult),
    [codingRows, codingResult],
  );
  const overallScore = overallScorePercent([aptitudeScore, codingScore]);

  // Spelling out what went into the average keeps it reconcilable with the tabs.
  const overallBasis = (() => {
    const parts: string[] = [];
    if (aptitudeScore !== null) parts.push('Aptitude');
    if (codingScore !== null) parts.push('Coding');
    if (parts.length === 0) return 'No scored modules';
    return `Average of ${parts.join(' + ')}`;
  })();

  const hasAptitude = !!aptitudeResult;
  const hasCoding = !!codingResult || codingRows.length > 0;

  // Everything the export needs, assembled from what the tabs already render so
  // the file and the screen can never disagree.
  const answerSheet: AnswerSheetData = useMemo(
    () => ({
      candidateEmail: email ?? '',
      jobPrefix: jobPrefix ?? '',
      submittedAt,
      overallStatus,
      overallScore,
      aptitude: aptitudeResult
        ? {
            score: aptitudeScore,
            status: aptitudeResult.status,
            marksLabel: `${aptitudeResult.score}${aptitudeResult.totalMarks ? `/${aptitudeResult.totalMarks}` : ''} marks`,
            answers: aptitudeAnswers,
            paper: aptitudePaper,
            submission: aptitudeParsed.submission,
          }
        : undefined,
      coding: hasCoding
        ? {
            score: codingScore,
            status: codingResult?.status,
            rows: codingRows,
            submission: codingParsed.submission,
          }
        : undefined,
    }),
    [
      email,
      jobPrefix,
      aptitudeResult,
      codingResult,
      submittedAt,
      overallStatus,
      overallScore,
      aptitudeScore,
      aptitudeAnswers,
      aptitudeParsed.submission,
      aptitudePaper,
      hasCoding,
      codingScore,
      codingRows,
      codingParsed.submission,
    ],
  );

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
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <div
                className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white text-lg sm:text-xl font-bold flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
              >
                {(email ?? '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                {/* break-all, because an email has no spaces to wrap at and
                    would otherwise push the whole card wider than the phone. */}
                <h1 className="text-lg sm:text-2xl font-bold text-[var(--text)] font-heading break-all">
                  {email}
                </h1>
                {/* Wraps to two lines on a phone; the divider is a desktop-only
                    flourish and is dropped rather than left dangling. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  <span className="text-sm text-[var(--textSecondary)]">
                    Job: <span className="font-semibold text-[var(--text)]">{jobPrefix}</span>
                  </span>
                  <span className="hidden sm:inline text-[var(--borderStrong)]">|</span>
                  <span className="text-sm text-[var(--textSecondary)]">
                    Submitted:{' '}
                    <span className="font-medium text-[var(--text)]">
                      {submittedAt
                        ? new Date(submittedAt).toLocaleDateString('en-US', {
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
            <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
              {/* The record of what the candidate actually wrote — for a hiring
                  decision, or for answering a disputed score. */}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download size={15} />}
                onClick={() => setExportingSheet(true)}
                disabled={!hasAptitude && !hasCoding}
              >
                Download Answer Sheet
              </Button>
              <Badge variant={statusVariant(overallStatus)} size="lg">
                {overallStatus}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Score Tiles ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          icon={<Award size={20} />}
          iconColor="var(--primary)"
          label="Overall Score"
          hint={overallBasis}
          chart={
            overallScore !== null ? (
              <RadialScore score={overallScore} size={80} stroke={8} status={overallStatus} />
            ) : (
              <KpiPlaceholder text="N/A" />
            )
          }
        />
        <KpiTile
          icon={<BookOpen size={20} />}
          iconColor="var(--info)"
          label="Aptitude"
          hint={
            aptitudeResult
              ? `${aptitudeResult.score}${aptitudeResult.totalMarks ? `/${aptitudeResult.totalMarks}` : ''} marks`
              : undefined
          }
          chart={
            aptitudeScore !== null ? (
              <RadialScore
                score={aptitudeScore}
                size={80}
                stroke={8}
                status={aptitudeResult?.status}
              />
            ) : (
              <KpiPlaceholder text="N/A" />
            )
          }
        />
        <KpiTile
          icon={<Code2 size={20} />}
          iconColor="#a855f7"
          label="Coding"
          hint={
            codingScore !== null
              ? `${codingStats.passedTests}/${codingStats.totalTests} test cases`
              : undefined
          }
          chart={
            codingScore !== null ? (
              <RadialScore
                score={codingScore}
                size={80}
                stroke={8}
                status={codingResult?.status}
              />
            ) : codingRows.length > 0 ? (
              <KpiValue value={`${codingStats.solved}/${codingStats.totalQ}`} sub="Q Solved" />
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
                submittedAt
                  ? new Date(submittedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '--'
              }
              sub={submittedAt ? new Date(submittedAt).getFullYear().toString() : ''}
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
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200
                ${isActive ? 'bg-[var(--primary)] text-white shadow-sm' : ''}
                ${!isActive && !disabled ? 'text-[var(--textSecondary)] hover:text-[var(--text)] hover:bg-[var(--bgMuted)]' : ''}
                ${disabled ? 'text-[var(--textQuaternary)] cursor-not-allowed' : ''}
              `}
            >
              <span className="flex-shrink-0">{icon}</span>
              <span className="capitalize truncate">{tab}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          aptitude={aptitudeResult}
          coding={codingResult}
          aptitudeScore={aptitudeScore}
          codingScore={codingScore}
          aptitudeAnswers={aptitudeAnswers}
          aptitudeSubmission={aptitudeParsed.submission}
          codingSubmission={codingParsed.submission}
          codingRows={codingRows}
          codingStats={codingStats}
          onOpenTab={setActiveTab}
        />
      )}
      {activeTab === 'aptitude' && aptitudeResult && (
        <AptitudeTab
          result={aptitudeResult}
          score={aptitudeScore}
          answers={aptitudeAnswers}
          paper={aptitudePaper}
          examWindow={examWindows.aptitude}
          assessmentId={assessmentIds.aptitude}
          lookupError={papersError}
          jobPrefix={jobPrefix ?? ''}
        />
      )}
      {activeTab === 'coding' && (
        <CodingTab
          result={codingResult}
          score={codingScore}
          rows={codingRows}
          examWindow={examWindows.coding}
          assessmentId={assessmentIds.coding}
          lookupError={papersError}
          paper={codingQuestions}
          jobPrefix={jobPrefix ?? ''}
        />
      )}

      {exportingSheet && (
        <AnswerSheetExportDialog data={answerSheet} onClose={() => setExportingSheet(false)} />
      )}
    </div>
  );
}

/**
 * Wraps a parsed question paper back into a File so it can go through the same
 * export dialog the Assign screen uses — one download flow, one set of formats.
 */
function paperAsFile(paper: unknown[], name: string): File {
  const json = JSON.stringify(paper, null, 2);
  return new File([new Blob([json], { type: 'application/json' })], `${name}.json`, {
    type: 'application/json',
  });
}

/**
 * The aptitude paper as stored, or a reconstruction from the result when the
 * original could not be loaded.
 *
 * The result rows carry the question text, the correct answer and the marks —
 * everything except the answer options, which are only in the paper. That is a
 * worse document than the real paper, but it is a usable one, and it matches
 * what the "View Question Paper" modal already falls back to. A dead download
 * button next to a working preview is just confusing.
 */
function aptitudePaperForExport(paper: RawQuestion[], answers: AptitudeAnswer[]): RawQuestion[] {
  if (paper.length > 0) return paper;
  return answers.map((answer, i) => ({
    id: answer.questionId ?? i + 1,
    question: answer.questionText || answer.question || '',
    // Empty rather than absent: the parser reads "has options" as "is aptitude".
    options: {},
    correctAnswer: answer.correctAnswer,
    Difficulty: answer.Difficulty || answer.category,
    marks: answer.marks,
  }));
}

/** The coding paper as stored, else rebuilt from the merged per-question rows. */
function codingPaperForExport(
  paper: RawCodingQuestion[],
  rows: CodingRow[],
): RawCodingQuestion[] {
  if (paper.length > 0) return paper;
  return rows.map((row, i) => ({
    id: row.question?.id ?? i + 1,
    title: rowTitle(row),
    description: row.question?.description ?? '',
    sampleInput: row.question?.sampleInput,
    sampleOutput: row.question?.sampleOutput,
    // Present (even if empty) so the parser treats this as a coding paper.
    testCases: row.question?.testCases ?? [],
    Difficulty: row.question?.Difficulty,
    marks: row.question?.marks,
  }));
}

// ── KPI Tile ──────────────────────────────────────────────────────────

function KpiTile({
  icon,
  iconColor,
  label,
  chart,
  hint,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  chart: React.ReactNode;
  /** Small caption spelling out what the number is derived from. */
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-2">
          {chart}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <span style={{ color: iconColor }}>{icon}</span>
              <span className="text-xs font-semibold text-[var(--textSecondary)]">{label}</span>
            </div>
            {hint && (
              <p className="text-[10px] text-[var(--textTertiary)] mt-1 leading-tight">{hint}</p>
            )}
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

// ── Areas to improve ───────────────────────────────────────────────────

function AreasToImprove({ areas, suffix }: { areas: string[]; suffix: string }) {
  if (areas.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle size={14} style={{ color: 'var(--success)' }} />
        <span className="text-[var(--textSecondary)]">
          No weak areas — every difficulty band is above the 60% mark.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
        <TrendingDown size={13} />
        Areas to improve
      </span>
      {areas.map((area) => (
        <Badge key={area} variant="error" size="sm">
          {area} {suffix}
        </Badge>
      ))}
    </div>
  );
}

/** Score + status block reused by both summary headers. */
function SummaryScore({
  score,
  status,
  caption,
  detail,
}: {
  /** Percentage, or null/undefined when the module has nothing to score. */
  score?: number | null;
  status?: string;
  caption: string;
  /** Raw figure the percentage came from, e.g. "19/30 marks". */
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {score !== undefined && score !== null ? (
        <RadialScore score={score} size={76} stroke={8} status={status} />
      ) : (
        <div className="w-[76px] h-[76px] rounded-full border-[7px] border-[var(--borderMuted)] flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-semibold text-[var(--textTertiary)]">N/A</span>
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--textTertiary)]">
          {caption}
        </p>
        {detail && <p className="text-xs text-[var(--textSecondary)] mt-1">{detail}</p>}
        {status && (
          <div className="mt-1.5">
            <Badge variant={statusVariant(status)} size="md">{status}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab({
  aptitude,
  coding,
  aptitudeScore,
  codingScore,
  aptitudeAnswers,
  aptitudeSubmission,
  codingSubmission,
  codingRows,
  codingStats,
  onOpenTab,
}: {
  aptitude?: Result;
  coding?: Result;
  aptitudeScore: number | null;
  codingScore: number | null;
  aptitudeAnswers: AptitudeAnswer[];
  /** How each module's attempt ended — recorded per result, so one each. */
  aptitudeSubmission?: SubmissionMeta;
  codingSubmission?: SubmissionMeta;
  codingRows: CodingRow[];
  codingStats: ReturnType<typeof summarizeCoding>;
  onOpenTab: (tab: DetailTab) => void;
}) {
  const aptitudeBands = useMemo(() => groupAptitudeByBand(aptitudeAnswers), [aptitudeAnswers]);
  const codingBands = useMemo(() => groupCodingByBand(codingRows), [codingRows]);
  const aptStats = useMemo(() => summarizeAptitude(aptitudeAnswers), [aptitudeAnswers]);

  const languageBreakdown = useMemo(() => {
    const langs = new Map<string, number>();
    for (const row of codingRows) {
      const lang = rowLanguage(row);
      if (!lang) continue;
      langs.set(lang, (langs.get(lang) ?? 0) + 1);
    }
    return Array.from(langs.entries());
  }, [codingRows]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Aptitude Summary Card */}
      {aptitude && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--infoMuted, rgba(6,182,212,0.12))' }}
                >
                  <BookOpen size={16} style={{ color: 'var(--info)' }} />
                </div>
                <CardTitle>Aptitude Summary</CardTitle>
              </div>
              <MiniButton onClick={() => onOpenTab('aptitude')}>Details</MiniButton>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <SummaryScore
                  score={aptitudeScore}
                  status={aptitude.status}
                  caption="Aptitude score"
                  detail={`${aptitude.score}${aptitude.totalMarks ? `/${aptitude.totalMarks}` : ''} marks`}
                />
                <div className="text-right">
                  <p className="text-xs text-[var(--textTertiary)] uppercase tracking-wider font-medium">
                    Questions
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">{aptStats.total}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <SummaryStat value={aptStats.correct} label="Correct" tone="success" />
                <SummaryStat value={aptStats.incorrect} label="Incorrect" tone="error" />
                <SummaryStat value={aptStats.answered} label="Answered" tone="info" />
                <SummaryStat value={aptStats.unanswered} label="Skipped" tone="warning" />
              </div>

              {aptitudeBands.length > 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Performance by difficulty
                  </p>
                  {aptitudeBands.map((band) => (
                    <SkillBar
                      key={band.name}
                      label={band.name}
                      percentage={band.pct}
                      detail={`${band.correct}/${band.total}`}
                    />
                  ))}
                </div>
              )}

              <SubmissionInfo
                meta={aptitudeSubmission}
                submittedAt={aptitude.submittedAt}
                className="pt-1"
              />

              <AreasToImprove areas={aptitudeAreasToImprove(aptitudeBands)} suffix="Aptitude" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coding Summary Card */}
      {(coding || codingRows.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(168,85,247,0.12)' }}
                >
                  <Code2 size={16} style={{ color: '#a855f7' }} />
                </div>
                <CardTitle>Programming Summary</CardTitle>
              </div>
              <MiniButton onClick={() => onOpenTab('coding')}>Details</MiniButton>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <SummaryScore
                  score={codingScore}
                  status={coding?.status}
                  caption="Coding score"
                  detail={`${codingStats.passedTests}/${codingStats.totalTests} test cases passed`}
                />
                <div className="text-right">
                  <p className="text-xs text-[var(--textTertiary)] uppercase tracking-wider font-medium">
                    Questions
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">{codingStats.totalQ}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <SummaryStat value={codingStats.solved} label="Solved" tone="success" />
                <SummaryStat value={codingStats.unsolved} label="Unsolved" tone="error" />
                <SummaryStat
                  value={`${codingStats.passedTests}/${codingStats.totalTests}`}
                  label="Test cases"
                  tone="info"
                />
                <SummaryStat value={`${codingStats.passRate}%`} label="Pass rate" tone="primary" />
              </div>

              {codingBands.length > 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Test cases by difficulty
                  </p>
                  {codingBands.map((band) => (
                    <SkillBar
                      key={band.name}
                      label={band.name}
                      percentage={band.pct}
                      detail={`${band.testsPassed}/${band.testsTotal}`}
                    />
                  ))}
                </div>
              )}

              {languageBreakdown.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                    Languages used
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

              <SubmissionInfo
                meta={codingSubmission}
                submittedAt={coding?.submittedAt}
                className="pt-1"
              />

              <AreasToImprove areas={codingAreasToImprove(codingBands)} suffix="Programming" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Aptitude Tab ───────────────────────────────────────────────────────

function AptitudeTab({
  result,
  score,
  answers,
  paper,
  examWindow,
  assessmentId,
  lookupError,
  jobPrefix,
}: Readonly<{
  result: Result;
  score: number | null;
  answers: AptitudeAnswer[];
  paper: RawQuestion[];
  examWindow?: string | null;
  /** Attempt these proctoring captures belong to. */
  assessmentId?: number;
  /** Set when the assessment lookup failed, so absence isn't reported as fact. */
  lookupError?: string | null;
  jobPrefix: string;
}>) {
  const [filter, setFilter] = useState<AptitudeFilter>('all');
  const [band, setBand] = useState<string>(ALL_BANDS);
  const [paperOpen, setPaperOpen] = useState(false);
  const [paperDownload, setPaperDownload] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  const stats = useMemo(() => summarizeAptitude(answers), [answers]);
  const bands = useMemo(() => groupAptitudeByBand(answers), [answers]);
  const exportPaper = useMemo(() => aptitudePaperForExport(paper, answers), [paper, answers]);

  // Chips in the band cards jump straight to the question they describe.
  const jumpToQuestion = useCallback((index: number) => {
    setFilter('all');
    setBand(ALL_BANDS);
    setHighlight(index);
    requestAnimationFrame(() => {
      document
        .getElementById(`apt-q-${index}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  useEffect(() => {
    if (highlight === null) return;
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const visible = useMemo(
    () =>
      answers
        .map((q, index) => ({ q, index }))
        .filter(({ q }) => {
          if (band !== ALL_BANDS && normalizeBand(q.Difficulty || q.category) !== band) return false;
          if (filter === 'correct') return !!q.isCorrect;
          if (filter === 'incorrect') return !q.isCorrect && isAnswered(q);
          if (filter === 'unanswered') return !isAnswered(q);
          return true;
        }),
    [answers, filter, band],
  );

  if (answers.length === 0) {
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
      {/* Summary */}
      <Card variant="elevated">
        <CardContent>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SummaryScore
                score={score}
                status={result.status}
                caption="Aptitude summary"
                detail={`${result.score}${result.totalMarks ? `/${result.totalMarks}` : ''} marks · ${stats.correct}/${stats.total} correct`}
              />
              {/* Stacked and full-width on a phone — see the coding tab. */}
              <div className="flex flex-col items-stretch sm:items-end gap-1.5 w-full sm:w-auto">
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<FileText size={15} />}
                    onClick={() => setPaperOpen(true)}
                  >
                    View Question Paper
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Download size={15} />}
                    disabled={exportPaper.length === 0}
                    onClick={() => setPaperDownload(true)}
                  >
                    Download Paper
                  </Button>
                </div>
                {/* Say when the download is a reconstruction, not the original. */}
                {paper.length === 0 && exportPaper.length > 0 && (
                  <p className="text-[11px] text-[var(--textTertiary)] text-left sm:text-right sm:max-w-xs">
                    Original paper unavailable — rebuilt from the stored result, without the
                    answer options.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryStat icon={<ListChecks size={13} />} value={stats.total} label="Total questions" />
              <SummaryStat icon={<CheckCircle size={13} />} value={stats.correct} label="Correct" tone="success" />
              <SummaryStat icon={<XCircle size={13} />} value={stats.incorrect} label="Incorrect" tone="error" />
              <SummaryStat icon={<HelpCircle size={13} />} value={stats.answered} label="Answered" tone="info" />
              <SummaryStat icon={<AlertTriangle size={13} />} value={stats.unanswered} label="Unanswered" tone="warning" />
              <SummaryStat
                icon={<Percent size={13} />}
                value={`${stats.accuracy}%`}
                label="Accuracy"
                tone="primary"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <AreasToImprove areas={aptitudeAreasToImprove(bands)} suffix="Aptitude" />
              {examWindow && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--textSecondary)]">
                  <Clock size={13} className="text-[var(--textTertiary)]" />
                  Exam window: <strong className="text-[var(--text)]">{examWindow}</strong>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Who sat this exam, and the room they sat it in */}
      <ProctoringCaptures
        assessmentId={assessmentId}
        lookupError={lookupError}
        moduleLabel="Aptitude"
      />

      {/* Difficulty bands */}
      <AptitudeBandCards bands={bands} onSelectQuestion={jumpToQuestion} />

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <FilterChips<AptitudeFilter>
              active={filter}
              onChange={setFilter}
              chips={[
                { value: 'all', label: 'All', count: stats.total },
                { value: 'correct', label: 'Correct', count: stats.correct, tone: 'success' },
                {
                  value: 'incorrect',
                  label: 'Incorrect',
                  count: answers.filter((q) => !q.isCorrect && isAnswered(q)).length,
                  tone: 'error',
                },
                {
                  value: 'unanswered',
                  label: 'Unanswered',
                  count: stats.unanswered,
                  tone: 'warning',
                },
              ]}
            />
            {bands.length > 1 && (
              <FilterChips<string>
                active={band}
                onChange={setBand}
                chips={[
                  { value: ALL_BANDS, label: 'All levels' },
                  ...bands.map((b) => ({ value: b.name, label: b.name, count: b.total })),
                ]}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Question list */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-center text-[var(--textSecondary)] py-8">
                No questions match the current filter.
              </p>
            </CardContent>
          </Card>
        )}

        {visible.map(({ q, index }) => {
          const outcome = answerOutcome(q.isCorrect, isAnswered(q));
          const style = OUTCOME[outcome];
          const isHighlighted = highlight === index;

          return (
            <div key={q.questionId ?? index} id={`apt-q-${index}`}>
              <Card
                className={isHighlighted ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]' : ''}
              >
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] leading-relaxed">
                        {q.questionText || q.question || `Question ${index + 1}`}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--textTertiary)]">Selected:</span>
                          <span
                            className="font-semibold px-2.5 py-1 rounded-lg"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {(q.selectedAnswer ?? '').toString().trim() || 'Not answered'}
                          </span>
                        </div>

                        {!q.isCorrect && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--textTertiary)]">Correct:</span>
                            <span
                              className="font-semibold px-2.5 py-1 rounded-lg"
                              style={{
                                background: OUTCOME.pass.bg,
                                color: OUTCOME.pass.color,
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

                        <Badge variant="primary" size="sm">
                          {normalizeBand(q.Difficulty || q.category)}
                        </Badge>
                      </div>
                    </div>

                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: style.bg, color: style.color }}
                    >
                      <OutcomeIcon outcome={outcome} size={16} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <AptitudePaperModal
        isOpen={paperOpen}
        onClose={() => setPaperOpen(false)}
        paper={paper}
        answers={answers}
      />

      {paperDownload && (
        <QuestionPaperExportDialog
          file={paperAsFile(exportPaper, `${jobPrefix}_aptitude_questions`)}
          title={`${jobPrefix} — Aptitude Question Paper`}
          onClose={() => setPaperDownload(false)}
        />
      )}
    </div>
  );
}

// ── Coding Tab ─────────────────────────────────────────────────────────

function CodingTab({
  result,
  score,
  rows,
  examWindow,
  assessmentId,
  lookupError,
  paper,
  jobPrefix,
}: Readonly<{
  result?: Result;
  score: number | null;
  rows: CodingRow[];
  examWindow?: string | null;
  /** Attempt these proctoring captures belong to. */
  assessmentId?: number;
  /** Set when the assessment lookup failed, so absence isn't reported as fact. */
  lookupError?: string | null;
  paper: RawCodingQuestion[];
  jobPrefix: string;
}>) {
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [filter, setFilter] = useState<CodingFilter>('all');
  const [paperOpen, setPaperOpen] = useState(false);
  const [paperDownload, setPaperDownload] = useState(false);
  const [codeRow, setCodeRow] = useState<CodingRow | null>(null);
  const [outputRow, setOutputRow] = useState<CodingRow | null>(null);

  const stats = useMemo(() => summarizeCoding(rows), [rows]);
  const bands = useMemo(() => groupCodingByBand(rows), [rows]);
  const exportPaper = useMemo(() => codingPaperForExport(paper, rows), [paper, rows]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'solved') return isRowSolved(row);
        if (filter === 'failed') return !isRowSolved(row) && isRowAttempted(row);
        if (filter === 'skipped') return !isRowAttempted(row);
        return true;
      }),
    [rows, filter],
  );

  if (rows.length === 0) {
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

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card variant="elevated">
        <CardContent>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SummaryScore
                score={score}
                status={result?.status}
                caption="Programming summary"
                detail={`${stats.passedTests}/${stats.totalTests} test cases · ${stats.solved}/${stats.totalQ} solved`}
              />
              {/* Left-aligned and full-width on a phone: two right-aligned
                  buttons with long labels overflowed the card. */}
              <div className="flex flex-col items-stretch sm:items-end gap-1.5 w-full sm:w-auto">
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<FileText size={15} />}
                    onClick={() => setPaperOpen(true)}
                  >
                    View Programming Question Paper
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Download size={15} />}
                    disabled={exportPaper.length === 0}
                    onClick={() => setPaperDownload(true)}
                  >
                    Download Paper
                  </Button>
                </div>
                {/* Say when the download is a reconstruction, not the original. */}
                {paper.length === 0 && exportPaper.length > 0 && (
                  <p className="text-[11px] text-[var(--textTertiary)] text-left sm:text-right sm:max-w-xs">
                    Original paper unavailable — rebuilt from the stored result, so problem
                    statements may be partial.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryStat icon={<ListChecks size={13} />} value={stats.totalQ} label="Total questions" />
              <SummaryStat icon={<CheckCircle size={13} />} value={stats.solved} label="Solved" tone="success" />
              <SummaryStat icon={<XCircle size={13} />} value={stats.unsolved} label="Unsolved" tone="error" />
              <SummaryStat icon={<Code2 size={13} />} value={stats.attempted} label="Attempted" tone="info" />
              <SummaryStat
                icon={<AlertTriangle size={13} />}
                value={stats.notAttempted}
                label="Not attempted"
                tone="warning"
              />
              <SummaryStat
                icon={<Target size={13} />}
                value={`${stats.passedTests}/${stats.totalTests}`}
                label="Test cases"
                tone="primary"
                hint={`${stats.passRate}% pass rate`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <AreasToImprove areas={codingAreasToImprove(bands)} suffix="Programming" />
              {examWindow && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--textSecondary)]">
                  <Clock size={13} className="text-[var(--textTertiary)]" />
                  Exam window: <strong className="text-[var(--text)]">{examWindow}</strong>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Who sat this exam, and the room they sat it in */}
      <ProctoringCaptures
        assessmentId={assessmentId}
        lookupError={lookupError}
        moduleLabel="Coding"
      />

      {/* Difficulty bands */}
      <CodingBandCards bands={bands} onViewCode={setCodeRow} onViewOutput={setOutputRow} />

      {/* Filters */}
      <Card>
        <CardContent>
          <FilterChips<CodingFilter>
            active={filter}
            onChange={setFilter}
            chips={[
              { value: 'all', label: 'All', count: stats.totalQ },
              { value: 'solved', label: 'Solved', count: stats.solved, tone: 'success' },
              {
                value: 'failed',
                label: 'Failing',
                count: rows.filter((r) => !isRowSolved(r) && isRowAttempted(r)).length,
                tone: 'error',
              },
              {
                value: 'skipped',
                label: 'Not attempted',
                count: stats.notAttempted,
                tone: 'warning',
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Per-question cards */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-center text-[var(--textSecondary)] py-8">
                No questions match the current filter.
              </p>
            </CardContent>
          </Card>
        )}

        {visible.map((row) => (
          <CodingQuestionCard
            key={row.key}
            row={row}
            expanded={expandedQ === row.key}
            onToggle={() => setExpandedQ(expandedQ === row.key ? null : row.key)}
            onViewCode={() => setCodeRow(row)}
            onViewOutput={() => setOutputRow(row)}
          />
        ))}
      </div>

      <CodingPaperModal isOpen={paperOpen} onClose={() => setPaperOpen(false)} rows={rows} />
      <SubmittedCodeModal row={codeRow} onClose={() => setCodeRow(null)} />
      <TestOutputModal row={outputRow} onClose={() => setOutputRow(null)} />

      {paperDownload && (
        <QuestionPaperExportDialog
          file={paperAsFile(exportPaper, `${jobPrefix}_coding_questions`)}
          title={`${jobPrefix} — Coding Question Paper`}
          onClose={() => setPaperDownload(false)}
        />
      )}
    </div>
  );
}

// ── Coding question card ───────────────────────────────────────────────

function CodingQuestionCard({
  row,
  expanded,
  onToggle,
  onViewCode,
  onViewOutput,
}: {
  row: CodingRow;
  expanded: boolean;
  onToggle: () => void;
  onViewCode: () => void;
  onViewOutput: () => void;
}) {
  const { label, question } = row;
  const tests = testsOf(row);
  const passCount = passedTestCount(row);
  const title = rowTitle(row);
  const prompt = question?.description || question?.question || '';
  const code = codeOf(row);
  const language = rowLanguage(row);
  const outcome = codingOutcome(row);
  const style = OUTCOME[outcome];
  const hasCode = isRowAttempted(row);

  return (
    <Card padding="none">
      {/* Header — the title area toggles, the actions stay independently clickable */}
      <div className="flex items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: style.bg, color: style.color }}
          >
            Q{label}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
            {prompt && (
              <p className="text-xs text-[var(--textSecondary)] mt-0.5 line-clamp-1">{prompt}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="primary" size="sm">{normalizeBand(question?.Difficulty)}</Badge>
              {language && <Badge variant="secondary" size="sm">{language}</Badge>}
              {tests.length > 0 && (
                <Badge variant={outcome === 'pass' ? 'success' : 'error'} size="sm">
                  {passCount}/{tests.length} passed
                </Badge>
              )}
              {!hasCode && <Badge variant="warning" size="sm">Not attempted</Badge>}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick actions — reach the code/output without expanding */}
          <span className="hidden sm:flex items-center gap-1.5">
            <MiniButton icon={<Code2 size={11} />} disabled={!code} onClick={onViewCode}>
              Code
            </MiniButton>
            <MiniButton
              tone="primary"
              icon={<Terminal size={11} />}
              disabled={tests.length === 0}
              onClick={onViewOutput}
            >
              Output
            </MiniButton>
          </span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: style.bg, color: style.color }}
          >
            <OutcomeIcon outcome={outcome} size={16} />
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse question' : 'Expand question'}
            className="p-1 rounded-lg text-[var(--textTertiary)] hover:text-[var(--text)] hover:bg-[var(--bgSubtle)] transition-colors"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-[var(--borderMuted)]">
          {/* The problem the candidate was asked to solve */}
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                Question {label}
              </p>
              <Badge variant="primary" size="sm">{normalizeBand(question?.Difficulty)}</Badge>
              {question?.marks !== undefined && (
                <span className="text-xs text-[var(--textTertiary)]">
                  Marks: <strong className="text-[var(--text)]">{question.marks}</strong>
                </span>
              )}
            </div>
            <div
              className="rounded-xl border border-[var(--borderMuted)] px-5 py-4"
              style={{ background: 'var(--bgSubtle)' }}
            >
              <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
              {prompt ? (
                <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap mt-2">
                  {prompt}
                </p>
              ) : (
                <p className="text-xs text-[var(--textTertiary)] mt-2 italic">
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
            </div>
          </div>

          {/* Nothing came back from the candidate for this question. */}
          {!hasCode && (
            <div className="rounded-xl border border-dashed border-[var(--borderMuted)] px-5 py-6 text-center">
              <p className="text-sm text-[var(--textSecondary)]">
                {code
                  ? 'The candidate left the starter template unchanged — this question was not attempted.'
                  : 'No code recorded for this question — the candidate never attempted it.'}
              </p>
            </div>
          )}

          {/* Code viewer */}
          {hasCode && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                  Submitted Code
                </p>
                {language && <Badge variant="primary" size="sm">{language}</Badge>}
              </div>
              <CodeBlock code={code} language={language} />
            </div>
          )}

          {/* Test case results */}
          {tests.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest">
                  Test Case Results
                </p>
                <span className="text-xs text-[var(--textSecondary)]">
                  <strong style={{ color: 'var(--success)' }}>{passCount} passed</strong>
                  {' · '}
                  <strong style={{ color: 'var(--error)' }}>{tests.length - passCount} failed</strong>
                  {' · '}
                  {tests.length} total
                </span>
              </div>
              <div className="space-y-3">
                {tests.map((tc, tIdx) => (
                  <TestCaseCard key={`${row.key}-tc-${tIdx}`} index={tIdx} test={tc} />
                ))}
              </div>
            </div>
          )}

          {/* Never ran — show what the answer would have been graded on. */}
          {tests.length === 0 && (question?.testCases?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[var(--textTertiary)] uppercase tracking-widest mb-3">
                Expected Test Cases ({question!.testCases!.length}) — none executed
              </p>
              <div className="space-y-3">
                {question!.testCases!.map((tc, tIdx) => (
                  <PlannedTestCaseCard key={`${row.key}-plan-${tIdx}`} index={tIdx} test={tc} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
