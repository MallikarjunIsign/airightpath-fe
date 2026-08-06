import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { JOB_PAGE_SIZES } from '@/hooks/useJobListing';
import type { JobListing, JobStatusFilter } from '@/hooks/useJobListing';

const STATUS_OPTIONS: { value: JobStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All Status' },
];

/** Search + type + status row shared by the admin and candidate job lists. */
export function JobListFilters({
  listing,
  searchPlaceholder,
}: {
  listing: JobListing;
  searchPlaceholder: string;
}) {
  const { counts } = listing;

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <Input
          placeholder={searchPlaceholder}
          leftIcon={<Search size={18} />}
          value={listing.searchQuery}
          onChange={(e) => listing.setSearchQuery(e.target.value)}
        />
      </div>
      {/* On a phone the two dropdowns share one row under the search box
          rather than each taking a full-width line. */}
      <div className="flex gap-3 sm:gap-4">
        <div className="flex-1 min-w-0 sm:flex-none sm:w-44">
          <Select
            options={[{ value: '', label: 'All Types' }, ...listing.jobTypes]}
            value={listing.filterType}
            onChange={(e) => listing.setFilterType(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-0 sm:flex-none sm:w-44">
          <Select
            options={STATUS_OPTIONS.map((opt) => ({
              value: opt.value,
              label: `${opt.label} (${counts[opt.value]})`,
            }))}
            value={listing.status}
            onChange={(e) => listing.setStatus(e.target.value as JobStatusFilter)}
          />
        </div>
      </div>
    </div>
  );
}

/** "Showing x–y of n" line above the grid. */
export function JobListCount({ listing }: { listing: JobListing }) {
  const { filtered, page, pageSize, status } = listing;
  const from = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered.length);
  const label = status === 'all' ? 'jobs' : `${status} jobs`;

  return (
    <p className="text-sm text-[var(--textSecondary)]">
      Showing {from}–{to} of {filtered.length} {label}
    </p>
  );
}

/** Page-size picker + pager, rendered under the grid. */
export function JobListPager({ listing }: { listing: JobListing }) {
  if (listing.filtered.length === 0) return null;

  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--textSecondary)] whitespace-nowrap">Per page</span>
        <div className="w-24">
          <Select
            options={JOB_PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            value={String(listing.pageSize)}
            onChange={(e) => listing.setPageSize(Number(e.target.value))}
          />
        </div>
      </div>

      <Pagination
        currentPage={listing.page}
        totalPages={listing.totalPages}
        onPageChange={listing.setPage}
        totalItems={listing.filtered.length}
        pageSize={listing.pageSize}
      />
    </div>
  );
}
