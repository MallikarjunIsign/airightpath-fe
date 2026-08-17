import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  FileBarChart,
  ClipboardList,
  Eye,
  CheckCircle,
  XCircle,
  Code2,
  FileSpreadsheet,
  SearchX,
  X,
  MinusCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobService } from '@/services/job.service';
import { jobApplicationService } from '@/services/job-application.service';
import { assessmentService } from '@/services/assessment.service';
import { compilerService } from '@/services/compiler.service';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useToast } from '@/components/ui/Toast';
import { downloadBlob } from '@/utils/question-paper.utils';
import { getAppEmail } from '@/utils/application.utils';
import { buildResultsWorkbook, resultsWorkbookFileName } from '@/utils/results-export.utils';
import {
  aptitudeScorePercent,
  codingScorePercent,
  overallScorePercent,
  buildCodingRows,
  scoreColor,
  splitResultsJson,
  orderedAttempts,
  summarizeAptitude,
  groupCodingByBand,
  normalizeBand,
  isAnswered,
  codeOf,
  rowTitle,
  rowLanguage,
  codingOutcome,
  passedTestCount,
  plannedTestCount,
  passMarkOf,
  moduleVerdict,
  overallVerdict,
  DEFAULT_PASS_PERCENTAGE,
} from '@/utils/result.utils';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';
import type { Assessment, RawCodingQuestion } from '@/types/assessment.types';
import type { Result, AptitudeAnswer, CodingAnswer } from '@/types/result.types';
import type { CodeSubmissionResponse } from '@/types/compiler.types';

/** Tolerate both a bare array and an `{ data: [...] }` envelope from the API. */
function asAssessmentList(body: unknown): Assessment[] {
  if (Array.isArray(body)) return body as Assessment[];
  const inner = (body as { data?: unknown })?.data;
  return Array.isArray(inner) ? (inner as Assessment[]) : [];
}

/** Results/answers are stored as a JSON string on the result row. */
function parseAnswers<T>(raw?: string): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Result filters. `ALL` is the absence of a filter, not a value to match. */
type StatusFilter = 'ALL' | 'PASSED' | 'FAILED' | 'PARTIAL';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PARTIAL', label: 'Pending' },
];

/** What one candidate's assessments on the selected job tell us. */
interface CandidateAssignment {
  email: string;
  /** Their coding assessment id, when they were set one. */
  codingId?: number;
  hasCoding: boolean;
  /** The pass mark each paper was assigned with, defaulted where absent. */
  aptitudePassMark: number;
  codingPassMark: number;
  /** When each paper's exam window opened, for the exported report. */
  aptitudeStart?: string;
  codingStart?: string;
}

// ── Aggregated candidate row ─────────────────────────────────────────
interface CandidateRow {
  email: string;
  /**
   * Every attempt at each module, oldest first. Re-assigning an exam adds a
   * result rather than replacing one, so a candidate can hold several.
   */
  aptitudeAttempts: Result[];
  codingAttempts: Result[];
  /** The latest attempt — what the scores and verdicts below describe. */
  aptitudeResult?: Result;
  codingResult?: Result;
  codeSubmissions: CodeSubmissionResponse[];
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  /** Coding was part of this candidate's exam, whether or not they sat it. */
  hasCoding: boolean;
  /** Percentages derived per module — `Result.score` is marks, not a percent. */
  aptitudeScore: number | null;
  codingScore: number | null;
  overallScore: number | null;
  /**
   * Pass/fail derived from the percentage against the paper's own pass mark.
   * Not `Result.status`, which was written by comparing raw marks to a
   * hardcoded 50 and contradicts the percentage shown beside it.
   */
  aptitudeVerdict: 'PASSED' | 'FAILED' | null;
  codingVerdict: 'PASSED' | 'FAILED' | null;
  /** The application behind the email — name, contact, experience, referral. */
  profile?: JobApplicationDTO;
  /** When each paper's exam window opened, as scheduled at assign time. */
  aptitudeStart?: string;
  codingStart?: string;
  /** Question counts behind the aptitude percentage, for the exported report. */
  aptitudeSummary?: { total: number; answered: number; correct: number };
  /** The aptitude answer sheet: one entry per question, as the candidate left it. */
  aptitudeAnswerSheet?: {
    number: number;
    question: string;
    difficulty: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    answered: boolean;
    marks: number | null;
  }[];
  /** One entry per coding question, paper-aware, for the exported report. */
  codingQuestions?: {
    label: string;
    title: string;
    difficulty: string;
    language?: string;
    outcome: 'pass' | 'fail' | 'skip';
    testsPassed: number;
    testsTotal: number;
    submittedAt?: string;
    /** The code as submitted — the coding half of the answer sheet. */
    code: string;
  }[];
  /** Coding broken down by difficulty band, for the exported report. */
  codingBands?: {
    name: string;
    questions: number;
    solved: number;
    attempted: number;
    testsPassed: number;
    testsTotal: number;
  }[];
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [exporting, setExporting] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = usePersistentState('results:selectedPrefix', '');
  const [results, setResults] = useState<Result[]>([]);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmissionResponse[]>([]);
  /** The job's coding paper; null until loaded, and null if it could not be. */
  const [codingPaper, setCodingPaper] = useState<RawCodingQuestion[] | null>(null);
  /** Emails with a coding assessment on this job, whether or not they sat it. */
  const [codingAssigned, setCodingAssigned] = useState<Set<string>>(new Set());
  /** Per-candidate assessment facts: pass marks and when each window opened. */
  const [assignments, setAssignments] = useState<Map<string, CandidateAssignment>>(new Map());
  /** Applications for the selected job, keyed by email — names and contact details. */
  const [profiles, setProfiles] = useState<Map<string, JobApplicationDTO>>(new Map());
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  // Not persisted, unlike the job selection: a filter left over from a previous
  // visit looks like missing data, and the job is the thing worth remembering.
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  /** Submission-date bounds as `YYYY-MM-DD`; '' means that end is open. */
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  /** Discards a slow coding lookup that lands after the job selection moved on. */
  const codingFetchToken = useRef(0);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    // Filters describe a cohort, so they cannot outlive the job they were set
    // against — carrying them over shows an empty table for a job that has results.
    setSearchTerm('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
    if (selectedPrefix) {
      fetchResults();
    } else {
      setResults([]);
      setCodeSubmissions([]);
      setCodingPaper(null);
      setCodingAssigned(new Set());
      setAssignments(new Map());
      setProfiles(new Map());
    }
  }, [selectedPrefix]);

  async function fetchJobs() {
    setLoadingJobs(true);
    try {
      const res = await jobService.getAllJobs();
      setJobs(res.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingJobs(false);
    }
  }

  async function fetchResults() {
    if (!selectedPrefix) return;
    setLoadingResults(true);
    try {
      // Applications come along for the ride: the results API knows only an
      // email, and the exported report needs the person behind it — name,
      // contact, experience, referral. Failure is tolerated so a profile lookup
      // cannot cost the page its results.
      const [resultsRes, codeRes, appsRes] = await Promise.all([
        assessmentService.getResultsByJobPrefix(selectedPrefix),
        compilerService.getResultsByJobPrefix(selectedPrefix),
        jobApplicationService.getByPrefix(selectedPrefix).catch(() => null),
      ]);
      const rows = resultsRes.data ?? [];
      const submissions = codeRes.data ?? [];
      setResults(rows);
      setCodeSubmissions(submissions);
      setProfiles(
        new Map(
          (appsRes?.data ?? []).map((app) => [getAppEmail(app).toLowerCase(), app]),
        ),
      );
      void fetchCodingContext(rows, submissions);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoadingResults(false);
    }
  }

  /**
   * Who was set coding on this job, and the paper they were set.
   *
   * The paper is needed for its test-case count. Without it the score's
   * denominator collapses to the tests the candidate happened to run, so
   * someone who passed 5 of 30 cases scored 5/5 = 100% here while their own
   * detail page said 17%. The number an admin shortlists on has to be the same
   * one on both screens.
   *
   * The assignment list is what makes an unsat coding module read 0% instead of
   * "--". Keying off the CODING *result* meant a candidate who never opened the
   * paper had no coding row at all, so their overall was their aptitude mark
   * alone — 47% here against the 24% their detail page showed for the same
   * exam. Never opening the paper passes none of its test cases, which is a
   * real zero and has to pull the average down. Only a candidate with no coding
   * assessment at all is genuinely unscoreable.
   *
   * Assignments are per candidate, hence one lookup each; the paper is fetched
   * once, because every candidate on a job sits the same one. That assumption
   * is verified per row before the paper is used — see `paperUsable` below — so
   * a job where it does not hold degrades to "no score" rather than a wrong one.
   */
  async function fetchCodingContext(rows: Result[], submissions: CodeSubmissionResponse[]) {
    const token = ++codingFetchToken.current;
    setCodingPaper(null);
    setCodingAssigned(new Set());
    setAssignments(new Map());

    const emails = Array.from(
      new Set(
        [...rows.map((r) => r.candidateEmail), ...submissions.map((s) => s.userEmail ?? '')].filter(
          Boolean,
        ),
      ),
    );
    if (emails.length === 0) return;

    // Silent: one unreachable candidate should cost that row its coding score,
    // not stack a red toast per candidate over the table.
    const assigned = await Promise.all(
      emails.map(async (email): Promise<CandidateAssignment | null> => {
        try {
          const res = await assessmentService.getAllAssessmentsForCandidate(email, { silent: true });
          const mine = asAssessmentList(res.data).filter((a) => a.jobPrefix === selectedPrefix);
          const coding = mine.find((a) => a.assessmentType === 'CODING');
          const aptitude = mine.find((a) => a.assessmentType === 'APTITUDE');
          // Returned even with no coding paper: the pass marks are wanted either
          // way, and dropping the row would grade aptitude against the default.
          return {
            email,
            codingId: coding?.id,
            hasCoding: !!coding,
            aptitudePassMark: passMarkOf(aptitude),
            codingPassMark: passMarkOf(coding),
            aptitudeStart: aptitude?.startTime,
            codingStart: coding?.startTime,
          };
        } catch {
          return null;
        }
      }),
    );
    if (token !== codingFetchToken.current) return;

    const found = assigned.filter((a): a is CandidateAssignment => a !== null);
    setCodingAssigned(new Set(found.filter((a) => a.hasCoding).map((a) => a.email)));
    setAssignments(new Map(found.map((a) => [a.email, a])));

    const paperId = found.find((a) => a.codingId != null)?.codingId;
    if (paperId == null) return;

    try {
      const paper = await assessmentService.fetchQuestions(paperId);
      if (token !== codingFetchToken.current) return;
      setCodingPaper(parseAnswers<RawCodingQuestion>(paper.data?.questions));
    } catch {
      // Best effort. A missing paper costs the coding column its percentage,
      // which is the honest outcome — never a number derived from a guess.
    }
  }

  // ── Aggregate results into per-candidate rows ────────────────────────
  const candidateRows: CandidateRow[] = useMemo(() => {
    const map = new Map<string, CandidateRow>();

    const blankRow = (email: string): CandidateRow => ({
      email,
      aptitudeAttempts: [],
      codingAttempts: [],
      codeSubmissions: [],
      overallStatus: 'PARTIAL',
      hasCoding: false,
      aptitudeScore: null,
      codingScore: null,
      overallScore: null,
      aptitudeVerdict: null,
      codingVerdict: null,
    });

    for (const r of results) {
      if (!map.has(r.candidateEmail)) {
        map.set(r.candidateEmail, blankRow(r.candidateEmail));
      }
      const row = map.get(r.candidateEmail)!;
      // Collected, not overwritten. Assigning here kept whichever result the
      // API happened to return last, which is not the same as the latest.
      if (r.assessmentType === 'APTITUDE') {
        row.aptitudeAttempts.push(r);
      } else if (r.assessmentType === 'CODING') {
        row.codingAttempts.push(r);
      }
    }

    // Attach code submissions
    for (const cs of codeSubmissions) {
      const email = cs.userEmail ?? '';
      if (!map.has(email)) {
        map.set(email, blankRow(email));
      }
      map.get(email)!.codeSubmissions.push(cs);
    }

    // Compute the module percentages, then grade them
    for (const row of map.values()) {
      // Order the attempts and score the most recent. The earlier ones stay on
      // the row so the table can say how many there were, and the detail page
      // can show them.
      row.aptitudeAttempts = orderedAttempts(row.aptitudeAttempts, 'APTITUDE');
      row.codingAttempts = orderedAttempts(row.codingAttempts, 'CODING');
      row.aptitudeResult = row.aptitudeAttempts[row.aptitudeAttempts.length - 1];
      row.codingResult = row.codingAttempts[row.codingAttempts.length - 1];

      // Aptitude ships raw marks and coding ships 0, so both are re-derived
      // here with the same helpers the result detail page uses — and, now, the
      // same question paper, without which the two could not agree.
      // splitResultsJson, not a plain parse: the stored array ends with the
      // record of how the exam was submitted, and counting that as a question
      // would break the paper-length check below by exactly one.
      const { answers: aptitudeAnswers } = splitResultsJson<AptitudeAnswer>(
        row.aptitudeResult?.resultsJson,
      );
      const { answers: codingAnswers } = splitResultsJson<CodingAnswer>(
        row.codingResult?.resultsJson,
      );

      row.hasCoding =
        !!row.codingResult || row.codeSubmissions.length > 0 || codingAssigned.has(row.email);

      // The stored result holds one entry per question on the paper, so a
      // matching length is good evidence this candidate sat the paper we
      // fetched. If it does not match, the denominator is unknown and no
      // percentage is better than a wrong one.
      //
      // No entries at all is not a mismatch — it is a candidate who never
      // submitted. The paper alone then describes the attempt: every question
      // on it unattempted, every test case failed, 0%.
      const paperUsable =
        codingPaper !== null &&
        codingPaper.length > 0 &&
        (codingAnswers.length === 0 ? row.hasCoding : codingPaper.length === codingAnswers.length);

      const codingRows = buildCodingRows(
        paperUsable ? codingPaper : [],
        row.codeSubmissions,
        codingAnswers,
      );
      row.aptitudeScore = aptitudeScorePercent(row.aptitudeResult, aptitudeAnswers);
      row.codingScore = paperUsable ? codingScorePercent(codingRows, row.codingResult) : null;
      row.overallScore = overallScorePercent([row.aptitudeScore, row.codingScore]);

      // Graded here rather than read off `Result.status`: that column compared
      // raw marks against a hardcoded 50, so a 17/20 aptitude paper was stored
      // FAILED and coding — which submits a literal score of 0 — always was.
      // Deriving it re-grades historic results correctly on read.
      const assignment = assignments.get(row.email);
      const aptitudeMark = assignment?.aptitudePassMark ?? DEFAULT_PASS_PERCENTAGE;
      const codingMark = assignment?.codingPassMark ?? DEFAULT_PASS_PERCENTAGE;

      row.profile = profiles.get(row.email.toLowerCase());
      row.aptitudeStart = assignment?.aptitudeStart;
      row.codingStart = assignment?.codingStart;

      // Counts behind the percentages. Answered and correct differ — a blank is
      // not a wrong answer, and a report that conflates them cannot tell someone
      // who ran out of time from someone who guessed badly.
      row.aptitudeSummary = row.aptitudeResult
        ? (({ total, answered, correct }) => ({ total, answered, correct }))(
            summarizeAptitude(aptitudeAnswers),
          )
        : undefined;

      // The answer sheet itself, question by question. Kept beside the counts
      // rather than instead of them: the totals say how someone did, this says
      // where, which is what anyone reviewing a borderline candidate opens.
      row.aptitudeAnswerSheet = row.aptitudeResult
        ? aptitudeAnswers.map((answer, index) => ({
            number: index + 1,
            question: answer.questionText || answer.question || `Question ${index + 1}`,
            difficulty: normalizeBand(answer.Difficulty || answer.category),
            selectedAnswer: (answer.selectedAnswer ?? '').toString().trim(),
            correctAnswer: (answer.correctAnswer ?? '').toString().trim(),
            isCorrect: !!answer.isCorrect,
            answered: isAnswered(answer),
            marks: typeof answer.marks === 'number' ? answer.marks : null,
          }))
        : undefined;

      // One row per question rather than per raw submission: the built rows
      // pair a question with whatever was run against it, so a question the
      // candidate never opened still appears instead of silently vanishing.
      row.codingQuestions = row.hasCoding
        ? codingRows.map((codingRow) => ({
            label: codingRow.label,
            title: rowTitle(codingRow),
            difficulty: normalizeBand(codingRow.question?.Difficulty),
            language: rowLanguage(codingRow),
            outcome: codingOutcome(codingRow),
            testsPassed: passedTestCount(codingRow),
            testsTotal: plannedTestCount(codingRow),
            submittedAt: codingRow.sub?.createdAt,
            code: codeOf(codingRow),
          }))
        : [];

      // Bands come from the paper's own difficulty labels, so only a usable
      // paper can produce them — without it there is nothing to group by.
      row.codingBands = paperUsable
        ? groupCodingByBand(codingRows).map((band) => ({
            name: band.name,
            questions: band.rows.length,
            solved: band.solved,
            attempted: band.attempted,
            testsPassed: band.testsPassed,
            testsTotal: band.testsTotal,
          }))
        : [];

      row.aptitudeVerdict = moduleVerdict(row.aptitudeScore, aptitudeMark);
      row.codingVerdict = row.hasCoding ? moduleVerdict(row.codingScore, codingMark) : null;

      // Only the bars for papers this candidate actually has count towards the
      // overall, so an aptitude-only candidate is not held to a coding standard.
      const applicable = [
        ...(row.aptitudeResult ? [aptitudeMark] : []),
        ...(row.hasCoding ? [codingMark] : []),
      ];
      row.overallStatus = overallVerdict(row.overallScore, applicable) ?? 'PARTIAL';
    }

    return Array.from(map.values());
  }, [results, codeSubmissions, codingPaper, codingAssigned, assignments, profiles]);

  // ── Filtering ────────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    // Local midnight to local end-of-day, so a bound of the 14th includes
    // everything submitted on the 14th. Parsed with an explicit time because
    // `new Date('2026-08-14')` is read as UTC and shifts the day either side.
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    return candidateRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.overallStatus !== statusFilter) return false;
      if (term && !row.email.toLowerCase().includes(term)) return false;

      if (from || to) {
        const submitted = submittedDateOf(row);
        // No submission date cannot satisfy a date range. Excluding these is
        // the honest reading of "submitted between X and Y".
        if (!submitted) return false;
        if (from && submitted < from) return false;
        if (to && submitted > to) return false;
      }
      return true;
    });
  }, [candidateRows, searchTerm, statusFilter, dateFrom, dateTo]);

  const filtersActive =
    statusFilter !== 'ALL' || searchTerm.trim() !== '' || dateFrom !== '' || dateTo !== '';

  /** Both ends set the wrong way round can only ever match nothing — say so. */
  const dateRangeInverted = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  }, []);

  // SearchInput fires this from an effect keyed on the callback, so it has to be
  // stable — an inline arrow would re-run the effect on every render.
  const handleSearch = useCallback((value: string) => setSearchTerm(value), []);

  // ── Summary stats ────────────────────────────────────────────────────
  // Counted over the visible rows so the cards, the table and the exported
  // workbook always describe the same set of candidates.
  const stats = useMemo(() => {
    const total = visibleRows.length;
    const passed = visibleRows.filter((r) => r.overallStatus === 'PASSED').length;
    const failed = visibleRows.filter((r) => r.overallStatus === 'FAILED').length;
    const partial = total - passed - failed;
    return { total, passed, failed, partial };
  }, [visibleRows]);

  const jobOptions = [
    { value: '', label: 'Select a job' },
    ...jobs.map((j) => ({ value: j.jobPrefix, label: `${j.jobTitle} (${j.jobPrefix})` })),
  ];

  /**
   * Exports exactly what the table is showing — the filtered rows, so a figure
   * in the workbook can always be traced back to a row on screen. The filter is
   * written into the Summary sheet: a partial export that does not say it is
   * partial is the one way this file could mislead someone reading it later.
   * The clock is read here rather than inside the builder to keep that pure.
   */
  async function handleExportExcel() {
    if (exporting || visibleRows.length === 0) return;
    setExporting(true);
    try {
      const input = {
        jobTitle: jobs.find((j) => j.jobPrefix === selectedPrefix)?.jobTitle ?? selectedPrefix,
        jobPrefix: selectedPrefix,
        rows: visibleRows,
        totalCandidates: candidateRows.length,
        filters: {
          status: STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All statuses',
          search: searchTerm.trim(),
          dateRange: describeDateRange(dateFrom, dateTo),
        },
        generatedAt: new Date(),
      };
      downloadBlob(await buildResultsWorkbook(input), resultsWorkbookFileName(input));
    } catch {
      showToast('Could not build the Excel report. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Assessment Results</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          View assessment scores and code submissions for candidates by job
        </p>
      </div>

      {/* Job Selector */}
      <Card>
        <CardContent>
          <div className="max-w-md">
            <Select
              label="Select Job"
              options={jobOptions}
              searchable
              searchPlaceholder="Search by job title or prefix..."
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {selectedPrefix && (
        <>
          {/* Filters — hidden until there is something to filter. */}
          {!loadingResults && candidateRows.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                  <SearchInput
                    onSearch={handleSearch}
                    initialValue={searchTerm}
                    placeholder="Search by candidate email..."
                    className="w-full sm:w-72"
                  />
                  <div className="w-full sm:w-44">
                    <Select
                      options={STATUS_FILTER_OPTIONS}
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    />
                  </div>
                  {/* Submitted between. Each end is optional, so "everything
                      since the 10th" needs only the one field. */}
                  <div className="w-full sm:w-44">
                    <Input
                      type="date"
                      label="Submitted from"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <Input
                      type="date"
                      label="Submitted to"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                  {filtersActive && (
                    <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </div>

                {dateRangeInverted && (
                  <p className="mt-3 text-sm text-[var(--error)]">
                    The "from" date is after the "to" date, so nothing can match.
                  </p>
                )}

                {/* Says plainly that the numbers below describe a subset — the
                    stat cards and the export both follow the filter. */}
                {filtersActive && !dateRangeInverted && (
                  <p className="mt-3 text-sm text-[var(--textSecondary)]">
                    Showing <strong className="text-[var(--text)]">{visibleRows.length}</strong> of{' '}
                    {candidateRows.length} candidate{candidateRows.length === 1 ? '' : 's'}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary Statistics */}
          {!loadingResults && candidateRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label={filtersActive ? 'Matching Candidates' : 'Total Candidates'}
                value={stats.total}
                color="var(--primary)"
              />
              <StatCard label="All Passed" value={stats.passed} color="#22c55e" />
              <StatCard label="Failed" value={stats.failed} color="#ef4444" />
              <StatCard label="Pending" value={stats.partial} color="#f59e0b" />
            </div>
          )}

          {/* Results Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileBarChart size={20} className="text-[var(--primary)]" />
                  <CardTitle>Candidate Results</CardTitle>
                </div>
                {/* Hidden while there is nothing to export, rather than
                    disabled: an empty workbook is not a useful thing to hand
                    someone, and the button would only invite the click. */}
                {!loadingResults && visibleRows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<FileSpreadsheet size={16} />}
                    isLoading={exporting}
                    onClick={handleExportExcel}
                  >
                    {filtersActive ? `Download Excel (${visibleRows.length})` : 'Download Excel'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingResults ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : candidateRows.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList size={48} />}
                  title="No assessment results"
                  description="No assessments have been completed for this job yet."
                />
              ) : visibleRows.length === 0 ? (
                /* Distinct from the empty job above: there are results here, the
                   filter just excludes all of them, and the way out is to clear
                   it rather than to go looking for missing data. */
                <EmptyState
                  icon={<SearchX size={48} />}
                  title="No matching candidates"
                  description={`None of the ${candidateRows.length} candidates on this job match the current filters.`}
                  action={{ label: 'Clear filters', onClick: clearFilters }}
                />
              ) : (
                <>
                  {/* Mobile: one card per candidate. Six columns — one of them a
                      full email address — cannot be read on a phone, and the
                      overall score matters more than any of them, so it leads. */}
                  <div className="lg:hidden space-y-3">
                    {visibleRows.map((row) => (
                      <div
                        key={row.email}
                        className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-[var(--text)] break-all min-w-0">
                            {row.email}
                          </p>
                          <OverallScore row={row} className="flex-shrink-0" />
                        </div>

                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                          <div className="min-w-0">
                            <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Aptitude</dt>
                            <dd>
                              <AptitudeCell row={row} />
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-[var(--textTertiary)] mb-0.5">Coding</dt>
                            <dd>
                              <CodingCell row={row} />
                            </dd>
                          </div>
                        </dl>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-sm text-[var(--textSecondary)]">
                            {getSubmittedDate(row)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye size={14} />}
                            onClick={() =>
                              navigate(
                                `/admin/assessments/results/${selectedPrefix}/${encodeURIComponent(row.email)}`
                              )
                            }
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: fixed layout so the email column wraps instead of
                      stretching the table past the card. */}
                  <div className="hidden lg:block">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[28%]">Candidate Email</TableHead>
                          <TableHead className="w-[15%]">Aptitude</TableHead>
                          <TableHead className="w-[16%]">Coding</TableHead>
                          <TableHead className="w-[17%]">Overall</TableHead>
                          <TableHead className="w-[12%]">Submitted</TableHead>
                          <TableHead className="w-[12%]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row) => (
                          <TableRow key={row.email}>
                            <TableCell className="font-medium align-top break-all">
                              {row.email}
                            </TableCell>
                            <TableCell className="align-top">
                              <AptitudeCell row={row} />
                            </TableCell>
                            <TableCell className="align-top">
                              <CodingCell row={row} />
                            </TableCell>
                            <TableCell className="align-top">
                              <OverallScore row={row} />
                            </TableCell>
                            <TableCell className="align-top text-sm text-[var(--textSecondary)]">
                              {getSubmittedDate(row)}
                            </TableCell>
                            <TableCell className="align-top">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                leftIcon={<Eye size={14} />}
                                onClick={() =>
                                  navigate(
                                    `/admin/assessments/results/${selectedPrefix}/${encodeURIComponent(row.email)}`
                                  )
                                }
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-[var(--textSecondary)]">{label}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// The three value cells, shared by the desktop row and the mobile card so the
// two renderings cannot drift apart.

/**
 * Says which attempt the figures above describe, and that there were others.
 * Without it a re-sat exam silently replaced the first on screen, and nobody
 * reviewing the row could tell it had happened.
 */
function AttemptNote({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p className="text-xs text-[var(--warning)] ml-5">
      Attempt {count} of {count}
    </p>
  );
}

function AptitudeCell({ row }: { row: CandidateRow }) {
  if (!row.aptitudeResult) {
    return <span className="text-[var(--textTertiary)] text-sm">--</span>;
  }
  const { score, totalMarks } = row.aptitudeResult;
  return (
    <div>
      <ScoreBadge
        score={row.aptitudeScore}
        status={row.aptitudeVerdict}
        detail={`${score}${totalMarks ? `/${totalMarks}` : ''} marks`}
      />
      <AttemptNote count={row.aptitudeAttempts.length} />
    </div>
  );
}

function CodingCell({ row }: { row: CandidateRow }) {
  // "--" is reserved for candidates who were never set coding. One who was set
  // it and never sat it scores 0, the same as on their detail page.
  if (!row.hasCoding) {
    return <span className="text-[var(--textTertiary)] text-sm">--</span>;
  }
  return (
    <div className="space-y-0.5">
      <ScoreBadge score={row.codingScore} status={row.codingVerdict} />
      <AttemptNote count={row.codingAttempts.length} />
      <CodingSubmissionSummary submissions={row.codeSubmissions} />
    </div>
  );
}

function OverallScore({ row, className = '' }: { row: CandidateRow; className?: string }) {
  let variant: 'success' | 'error' | 'warning' = 'warning';
  if (row.overallStatus === 'PASSED') variant = 'success';
  else if (row.overallStatus === 'FAILED') variant = 'error';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="text-sm font-bold tabular-nums"
        style={{
          // The verdict is passed so the number is not drawn amber beside its own
          // green PASSED badge — 65% against a 60% pass mark is a pass, however
          // the generic 80/60 colour bands would otherwise band it.
          color:
            row.overallScore === null
              ? 'var(--textTertiary)'
              : scoreColor(
                  row.overallScore,
                  row.overallStatus === 'PARTIAL' ? undefined : row.overallStatus,
                ),
        }}
      >
        {row.overallScore === null ? '--' : `${row.overallScore}%`}
      </span>
      <Badge variant={variant} size="sm">
        {row.overallStatus === 'PARTIAL' ? 'Pending' : row.overallStatus}
      </Badge>
    </div>
  );
}

function ScoreBadge({
  score,
  status,
  detail,
}: {
  /** Percentage, or null when the module cannot be scored. */
  score: number | null;
  /** Derived verdict; null when there is no score to grade. */
  status?: string | null;
  detail?: string;
}) {
  const isPassed = status === 'PASSED';
  const isFailed = status === 'FAILED';
  // An ungraded module reads amber, not red. Drawing a red cross against "--"
  // said the candidate had failed something they were never scored on.
  let tone = 'text-[var(--textTertiary)]';
  if (isPassed) tone = 'text-green-600';
  else if (isFailed) tone = 'text-red-600';

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {isPassed && <CheckCircle size={14} className="text-green-500" />}
        {isFailed && <XCircle size={14} className="text-red-500" />}
        {!isPassed && !isFailed && <MinusCircle size={14} className="text-[var(--textTertiary)]" />}
        <span className={`text-sm font-semibold ${tone}`}>
          {score === null ? '--' : `${score}%`}
        </span>
      </div>
      {detail && <p className="text-xs text-[var(--textTertiary)] ml-5">{detail}</p>}
    </div>
  );
}

function CodingSubmissionSummary({ submissions }: { submissions: CodeSubmissionResponse[] }) {
  const totalTests = submissions.reduce((sum, s) => sum + (s.testResults?.length ?? 0), 0);
  if (totalTests === 0) return null;

  const passedTests = submissions.reduce(
    (sum, s) => sum + (s.testResults?.filter((t) => t.passed).length ?? 0),
    0
  );
  const allPassed = passedTests === totalTests;

  return (
    <div className="flex items-center gap-1.5">
      {allPassed ? (
        <CheckCircle size={12} className="text-green-500" />
      ) : (
        <Code2 size={12} className="text-amber-500" />
      )}
      <span className="text-xs text-[var(--textTertiary)]">
        {passedTests}/{totalTests} tests
      </span>
    </div>
  );
}

/**
 * The submitted-between filter in words, for the workbook's Summary sheet.
 * Empty when neither end is set, which is what marks the export as unfiltered.
 */
function describeDateRange(from: string, to: string): string {
  const day = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString();
  if (from && to) return `${day(from)} to ${day(to)}`;
  if (from) return `From ${day(from)}`;
  if (to) return `Up to ${day(to)}`;
  return '';
}

/**
 * The date a candidate's attempt is filed under. Shared by the Submitted column
 * and the date filter so the two cannot disagree about which day a row is on.
 */
function submittedDateOf(row: CandidateRow): Date | null {
  const raw =
    row.aptitudeResult?.submittedAt ?? row.codingResult?.submittedAt ?? row.aptitudeResult?.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSubmittedDate(row: CandidateRow): string {
  return submittedDateOf(row)?.toLocaleDateString() ?? '--';
}
