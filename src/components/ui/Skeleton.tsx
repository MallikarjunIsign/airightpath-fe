import { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
  circle?: boolean;
}

export function Skeleton({ width, height, circle = false, className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`
        shimmer
        ${circle ? 'rounded-full' : 'rounded-xl'}
        ${className}
      `}
      style={{ width, height }}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div
      className="
        bg-[var(--cardBg)]
        border border-[var(--borderMuted,var(--cardBorder))]/50
        rounded-2xl p-4 space-y-3
      "
    >
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height="16px" className="flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} height="40px" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div
      className="
        bg-[var(--cardBg)]
        border border-[var(--borderMuted,var(--cardBorder))]/50
        rounded-2xl p-6 space-y-4
        shadow-[0_1px_3px_rgba(0,0,0,0.08)]
      "
    >
      <Skeleton height="24px" width="60%" />
      <Skeleton height="16px" width="40%" />
      <div className="space-y-2">
        <Skeleton height="12px" />
        <Skeleton height="12px" />
        <Skeleton height="12px" width="80%" />
      </div>
    </div>
  );
}
