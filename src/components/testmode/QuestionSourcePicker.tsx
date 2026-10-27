import { useCallback, useEffect, useRef, useState } from 'react';
import { FileJson, Sparkles, Upload, Library, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { jobService } from '@/services/job.service';
import { assessmentService } from '@/services/assessment.service';
import { toAssessmentList } from '@/utils/assessment.utils';
import { readPaperFile, parseStoredPaper, parseAptitudePaper, parseCodingPaper } from '@/utils/test-mode.utils';
import type { PaperKind } from '@/utils/test-mode.utils';
import sampleAptitude from '@/data/sample-aptitude-paper.json';
import sampleCoding from '@/data/sample-coding-paper.json';
import type { AssessmentSummary, RawQuestion, RawCodingQuestion } from '@/types/assessment.types';
import type { JobPostDTO } from '@/types/job.types';

/** Where a Test Mode paper came from, which the result screen reports back. */
export type PaperSource = 'sample' | 'upload' | 'generated' | 'assigned';

export interface LoadedPaper {
  source: PaperSource;
  /** Shown on the result screen so a score can be traced to its paper. */
  label: string;
  questions: (RawQuestion | RawCodingQuestion)[];
}

const SOURCE_LABEL: Record<PaperSource, string> = {
  sample: 'Built-in sample',
  upload: 'Uploaded file',
  generated: 'AI generated',
  assigned: 'Assigned paper',
};

/**
 * Picks the questions a Test Mode run will use.
 *
 * Four routes in, deliberately: the sample proves the flow works with no setup,
 * an upload lets someone check a paper before assigning it for real, the
 * generator exercises the AI path, and loading a paper already assigned on a job
 * answers "what are candidates on this job actually being asked?" — the question
 * an admin most often wants and previously could only answer by sitting the exam.
 */
export function QuestionSourcePicker({
  kind,
  onLoaded,
}: Readonly<{
  kind: PaperKind;
  onLoaded: (paper: LoadedPaper) => void;
}>) {
  const [jobs, setJobs] = useState<JobPostDTO[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [busy, setBusy] = useState<PaperSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await jobService.getAllJobs();
        if (!cancelled) setJobs(res.data ?? []);
      } catch {
        // The two job-backed sources simply stay unavailable; the sample and
        // upload routes do not need a job list and must keep working.
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sampleLabel = kind === 'aptitude' ? '30 aptitude questions' : '6 coding questions';

  const loadSample = useCallback(() => {
    setError(null);
    // Validated rather than trusted: the samples are ordinary JSON files that a
    // future edit could break, and a broken sample should say so here rather
    // than fail obscurely inside the exam.
    const result = kind === 'aptitude' ? parseAptitudePaper(sampleAptitude) : parseCodingPaper(sampleCoding);
    if (!result.ok) {
      setError(`The built-in sample failed to load: ${result.error}`);
      return;
    }
    onLoaded({ source: 'sample', label: `Built-in sample (${sampleLabel})`, questions: result.questions });
  }, [kind, onLoaded, sampleLabel]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy('upload');
      try {
        const result = await readPaperFile(file, kind);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onLoaded({ source: 'upload', label: file.name, questions: result.questions });
      } finally {
        setBusy(null);
        // Cleared so re-picking the same file after a fix fires onChange again.
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [kind, onLoaded],
  );

  const generate = useCallback(async () => {
    if (!selectedPrefix) return;
    setError(null);
    setBusy('generated');
    try {
      const res =
        kind === 'aptitude'
          ? await assessmentService.generateQuestions(selectedPrefix)
          : await assessmentService.generateCodingQuestions(selectedPrefix);
      const result = kind === 'aptitude' ? parseAptitudePaper(res.data) : parseCodingPaper(res.data);
      if (!result.ok) {
        setError(`The generator returned something unusable: ${result.error}`);
        return;
      }
      onLoaded({
        source: 'generated',
        label: `AI generated for ${selectedPrefix}`,
        questions: result.questions,
      });
    } catch {
      // Interceptor has already shown the transport error; this line explains
      // what it means for the thing the admin was trying to do.
      setError('Generation failed. The AI request may have timed out — try again.');
    } finally {
      setBusy(null);
    }
  }, [kind, onLoaded, selectedPrefix]);

  const loadAssigned = useCallback(async () => {
    if (!selectedPrefix) return;
    setError(null);
    setBusy('assigned');
    try {
      // One request for the job's assignments, then the newest paper of the
      // right type. Newest rather than first: a re-assigned exam leaves several,
      // and the latest is the one candidates are sitting now.
      const wanted = kind === 'aptitude' ? 'APTITUDE' : 'CODING';
      const res = await assessmentService.getAssessmentsByJobPrefix(selectedPrefix, { silent: true });
      const assignments = toAssessmentList<AssessmentSummary>(res.data).filter(
        (a) => a.assessmentType === wanted,
      );
      if (assignments.length === 0) {
        setError(`No ${wanted.toLowerCase()} assessment has been assigned on ${selectedPrefix} yet.`);
        return;
      }
      const latest = assignments[assignments.length - 1];
      const paper = await assessmentService.fetchQuestions(latest.id);
      const result = parseStoredPaper(paper.data?.questions, kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onLoaded({
        source: 'assigned',
        label: `Assigned paper on ${selectedPrefix}`,
        questions: result.questions,
      });
    } catch {
      setError(`Could not load the assigned paper for ${selectedPrefix}.`);
    } finally {
      setBusy(null);
    }
  }, [kind, onLoaded, selectedPrefix]);

  const jobOptions = [
    { value: '', label: jobsLoading ? 'Loading jobs…' : 'Select a job' },
    ...jobs.map((job) => ({ value: job.jobPrefix, label: `${job.jobTitle} (${job.jobPrefix})` })),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1 — Sample. First because it is the only one that needs nothing. */}
        <SourceCard
          icon={<FileJson size={18} />}
          title="Built-in sample"
          description={`Start immediately with ${sampleLabel} covering Basic, Intermediate and Advanced.`}
        >
          <Button variant="primary" size="sm" onClick={loadSample} className="w-full">
            Use sample paper
          </Button>
        </SourceCard>

        {/* 2 — Upload. */}
        <SourceCard
          icon={<Upload size={18} />}
          title="Upload a paper"
          description="Check a JSON paper renders correctly before you assign it to anyone."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            isLoading={busy === 'upload'}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose JSON file
          </Button>
        </SourceCard>
      </div>

      {/* The two job-backed sources share one job selection, so they share a card. */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-[var(--primary)] mt-0.5">
              <Library size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text)]">From a job</p>
              <p className="text-sm text-[var(--textSecondary)]">
                Load the paper candidates on a job are actually being asked, or generate a fresh
                one against that job description.
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <Select
              label="Job"
              options={jobOptions}
              searchable
              searchPlaceholder="Search by job title or prefix..."
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Library size={14} />}
              disabled={!selectedPrefix || busy !== null}
              isLoading={busy === 'assigned'}
              onClick={loadAssigned}
            >
              Load assigned paper
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Sparkles size={14} />}
              disabled={!selectedPrefix || busy !== null}
              isLoading={busy === 'generated'}
              onClick={generate}
            >
              Generate with AI
            </Button>
            {busy === 'generated' && (
              <span className="flex items-center gap-2 text-sm text-[var(--textSecondary)]">
                <Loader2 size={14} className="animate-spin" />
                This can take a minute.
              </span>
            )}
          </div>

          {/* Says plainly that the one route touching real data still writes
              nothing — reading a paper is not the same as assigning it. */}
          <p className="text-xs text-[var(--textTertiary)]">
            Both read from the server. Neither writes: no assessment is created and no paper is
            replaced.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--error)] bg-[var(--error)]/5 px-4 py-3">
          <AlertTriangle size={16} className="text-[var(--error)] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--text)]">{error}</p>
        </div>
      )}
    </div>
  );
}

function SourceCard({
  icon,
  title,
  description,
  children,
}: Readonly<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}>) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-[var(--primary)] mt-0.5">{icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--text)]">{title}</p>
            <p className="text-sm text-[var(--textSecondary)]">{description}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Chip naming the loaded paper, shown on later stages of a Test Mode run. */
export function PaperSourceBadge({ paper }: Readonly<{ paper: LoadedPaper }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" size="sm">
        <CheckCircle2 size={12} className="mr-1 inline" />
        {SOURCE_LABEL[paper.source]}
      </Badge>
      <span className="text-sm text-[var(--textSecondary)]">{paper.label}</span>
      <span className="text-sm text-[var(--textTertiary)]">
        · {paper.questions.length} question{paper.questions.length === 1 ? '' : 's'}
      </span>
    </div>
  );
}
