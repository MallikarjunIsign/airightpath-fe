import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { promptService } from '@/services/prompt.service';
import { extractApiError } from '@/services/api.service';

interface JobOption {
  jobPrefix: string;
  jobTitle: string;
}

/**
 * Reuse another job's prompts for this one.
 *
 * A new job has a new job id, and the prompts, evaluation categories and interview settings are filed under the
 * old one's, so a recruiter opening the new job found nothing and had to retype it all. This lists the jobs that
 * already have prompts and copies the chosen one's across in a single step, saved at once.
 */
export function ReusePromptDialog({
  isOpen,
  onClose,
  targetPrefix,
  jobs,
  onCopied,
}: Readonly<{
  isOpen: boolean;
  onClose: () => void;
  targetPrefix: string;
  jobs: JobOption[];
  onCopied: () => void;
}>) {
  const { showToast } = useToast();
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFrom('');
    setLoading(true);
    promptService
      .getJobsWithPrompts()
      .then((res) => {
        if (!cancelled) setSources(res.data ?? {});
      })
      .catch(() => {
        if (!cancelled) setSources({});
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const titleOf = (prefix: string) => jobs.find((j) => j.jobPrefix === prefix)?.jobTitle ?? prefix;
  const options = Object.keys(sources)
    .filter((prefix) => prefix !== targetPrefix)
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
    .map((prefix) => ({
      value: prefix,
      label: `${titleOf(prefix)} (${prefix}) \u2014 ${sources[prefix].join(', ')}`,
    }));

  async function copy() {
    if (!from) return;
    setCopying(true);
    try {
      const res = await promptService.copy(from, targetPrefix);
      const { prompts, categories, interviewSettings } = res.data;
      showToast(
        `Reused ${prompts} prompt${prompts === 1 ? '' : 's'}, ${categories} evaluation categor${categories === 1 ? 'y' : 'ies'} and ${interviewSettings} interview setting${interviewSettings === 1 ? '' : 's'} from ${titleOf(from)}.`,
        'success',
      );
      onCopied();
      onClose();
    } catch (err) {
      const api = extractApiError(err);
      showToast(api.serverMessage || api.message || 'The prompts could not be copied.', 'error');
    } finally {
      setCopying(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reuse prompts from another job"
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={copying}>
            Cancel
          </Button>
          <Button onClick={copy} disabled={!from || copying} isLoading={copying}>
            Copy to {targetPrefix || 'this job'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--textSecondary)]">
          Copies the chosen job&apos;s prompts, evaluation categories and interview settings to{' '}
          <strong className="text-[var(--text)]">{targetPrefix || 'this job'}</strong> and saves them. Anything this
          job already has of the same kind is replaced; you can still edit it afterwards.
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-[var(--primary)]" size={22} />
          </div>
        ) : options.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--textSecondary)]">
            No other job has prompts yet. Create them for one job first, then reuse them here.
          </p>
        ) : (
          <Select
            label="Copy from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            options={[{ value: '', label: 'Choose a job' }, ...options]}
          />
        )}
      </div>
    </Modal>
  );
}
