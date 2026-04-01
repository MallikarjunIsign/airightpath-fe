import { HTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  showFirstLast?: boolean;
  totalItems?: number;
  pageSize?: number;
}

function generatePageNumbers(current: number, total: number, siblings: number): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = [];

  const leftSibling = Math.max(current - siblings, 1);
  const rightSibling = Math.min(current + siblings, total);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  if (total <= siblings * 2 + 5) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  }

  pages.push(1);

  if (showLeftEllipsis) {
    pages.push('ellipsis');
  } else {
    for (let i = 2; i < leftSibling; i++) {
      pages.push(i);
    }
  }

  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== total) {
      pages.push(i);
    }
  }

  if (showRightEllipsis) {
    pages.push('ellipsis');
  } else {
    for (let i = rightSibling + 1; i < total; i++) {
      pages.push(i);
    }
  }

  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showFirstLast = true,
  totalItems,
  pageSize,
  className = '',
  ...props
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = generatePageNumbers(currentPage, totalPages, siblingCount);

  const buttonBase = `
    inline-flex items-center justify-center
    w-9 h-9 rounded-xl text-sm font-medium
    transition-all duration-200
    disabled:opacity-40 disabled:cursor-not-allowed
  `;

  return (
    <div className={`flex items-center justify-between gap-4 ${className}`} {...props}>
      {totalItems !== undefined && pageSize !== undefined && (
        <p className="text-sm text-[var(--textSecondary)] tabular-nums">
          Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)}
          {' '}-{' '}
          {Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </p>
      )}

      <nav className="flex items-center gap-1" aria-label="Pagination">
        {showFirstLast && (
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className={`${buttonBase} text-[var(--textSecondary)] hover:bg-[var(--bgSubtle,var(--surface1))] hover:text-[var(--text)]`}
            aria-label="First page"
          >
            <ChevronsLeft size={16} />
          </button>
        )}

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`${buttonBase} text-[var(--textSecondary)] hover:bg-[var(--bgSubtle,var(--surface1))] hover:text-[var(--text)]`}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {pages.map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="w-9 h-9 inline-flex items-center justify-center text-[var(--textTertiary)]"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`
                ${buttonBase}
                ${page === currentPage
                  ? 'bg-[var(--primary)] text-white shadow-[0_1px_4px_rgba(99,102,241,0.3)]'
                  : 'text-[var(--textSecondary)] hover:bg-[var(--bgSubtle,var(--surface1))] hover:text-[var(--text)]'
                }
              `}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`${buttonBase} text-[var(--textSecondary)] hover:bg-[var(--bgSubtle,var(--surface1))] hover:text-[var(--text)]`}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>

        {showFirstLast && (
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className={`${buttonBase} text-[var(--textSecondary)] hover:bg-[var(--bgSubtle,var(--surface1))] hover:text-[var(--text)]`}
            aria-label="Last page"
          >
            <ChevronsRight size={16} />
          </button>
        )}
      </nav>
    </div>
  );
}
