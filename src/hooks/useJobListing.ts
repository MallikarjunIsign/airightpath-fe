import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from './usePersistentState';
import { canonicalJobType } from '@/utils/job.utils';
import type { JobPostDTO } from '@/types/job.types';

/**
 * Search / type / status filtering plus paging for the job-event lists.
 * Shared by the admin and candidate screens so both behave identically.
 *
 * Everything runs client-side because `GET /api/jobs/getPost` returns the whole
 * list in one shot — see `docs/backend-requirements-job-listing.md` for the
 * server-side paging contract this hook should switch to once it exists.
 */

export type JobStatusFilter = 'active' | 'expired' | 'all';

export const JOB_PAGE_SIZES = [20, 40, 60, 100];

export const DEFAULT_JOB_PAGE_SIZE = 20;

/**
 * What a job is called in the lists: the role, which identifies the position
 * more precisely than the title. Jobs created before the role became mandatory
 * fall back to the title.
 */
export function jobDisplayName(job: Pick<JobPostDTO, 'role' | 'jobTitle'>): string {
  return job.role?.trim() || job.jobTitle;
}

/** A job is expired once its application deadline is before today. */
export function isJobExpired(job: Pick<JobPostDTO, 'applicationDeadline'>): boolean {
  if (!job.applicationDeadline) return false;
  return new Date(job.applicationDeadline) < new Date(new Date().toDateString());
}


export interface JobListing {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filterType: string;
  setFilterType: (value: string) => void;
  status: JobStatusFilter;
  setStatus: (value: JobStatusFilter) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** Deduped, title-cased type options; `value` is the lowercased key. */
  jobTypes: { value: string; label: string }[];
  /** Everything matching search + type + status. */
  filtered: JobPostDTO[];
  /** The current page of `filtered`. */
  paged: JobPostDTO[];
  totalPages: number;
  /** How many of the search/type matches fall in each status bucket. */
  counts: { all: number; active: number; expired: number };
}

export function useJobListing(jobs: JobPostDTO[], storagePrefix: string): JobListing {
  const [searchQuery, setSearchQuery] = usePersistentState(`${storagePrefix}:searchQuery`, '');
  const [filterType, setFilterType] = usePersistentState(`${storagePrefix}:filterType`, '');
  // Active-only by default — expired events are the long tail nobody acts on.
  const [status, setStatus] = usePersistentState<JobStatusFilter>(
    `${storagePrefix}:status`,
    'active',
  );
  const [pageSize, setPageSize] = usePersistentState(
    `${storagePrefix}:pageSize`,
    DEFAULT_JOB_PAGE_SIZE,
  );
  const [page, setPage] = useState(1);

  // Keyed on the canonical type, so "Full-time" and "Full-Time" are one option.
  const jobTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const job of jobs) {
      if (!job.jobType?.trim()) continue;
      seen.add(canonicalJobType(job.jobType));
    }
    return Array.from(seen, (label) => ({ value: label, label }));
  }, [jobs]);

  // Search + type first, so the status counts describe the current search.
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch =
        !q ||
        job.jobTitle?.toLowerCase().includes(q) ||
        (job.role ?? '').toLowerCase().includes(q) ||
        job.companyName?.toLowerCase().includes(q) ||
        (job.keySkills ?? '').toLowerCase().includes(q) ||
        job.location?.toLowerCase().includes(q) ||
        job.jobPrefix?.toLowerCase().includes(q);

      const matchesType = !filterType || canonicalJobType(job.jobType) === filterType;

      return matchesSearch && matchesType;
    });
  }, [jobs, searchQuery, filterType]);

  const counts = useMemo(() => {
    const expired = matches.filter(isJobExpired).length;
    return { all: matches.length, active: matches.length - expired, expired };
  }, [matches]);

  const filtered = useMemo(() => {
    if (status === 'all') return matches;
    const wantExpired = status === 'expired';
    return matches.filter((job) => isJobExpired(job) === wantExpired);
  }, [matches, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // A narrower filter (or a smaller page size) can strand the user past the
  // last page — pull them back rather than showing an empty grid.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  return {
    searchQuery,
    setSearchQuery: (value) => {
      setSearchQuery(value);
      setPage(1);
    },
    filterType,
    setFilterType: (value) => {
      setFilterType(value);
      setPage(1);
    },
    status,
    setStatus: (value) => {
      setStatus(value);
      setPage(1);
    },
    page,
    setPage,
    pageSize,
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
    jobTypes,
    filtered,
    paged,
    totalPages,
    counts,
  };
}
