import { HTMLAttributes, ReactNode } from 'react';

interface TimelineItem {
  id: string | number;
  title: string;
  description?: string;
  timestamp?: string;
  icon?: ReactNode;
  iconBgClass?: string;
}

interface TimelineProps extends HTMLAttributes<HTMLDivElement> {
  items: TimelineItem[];
}

export function Timeline({ items, className = '', ...props }: TimelineProps) {
  return (
    <div className={`relative ${className}`} {...props}>
      {items.map((item, index) => (
        <TimelineEntry
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
        />
      ))}
    </div>
  );
}

interface TimelineEntryProps {
  item: TimelineItem;
  isLast: boolean;
}

function TimelineEntry({ item, isLast }: TimelineEntryProps) {
  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {/* Vertical line */}
      {!isLast && (
        <div
          className="absolute left-[15px] top-8 w-0.5 h-[calc(100%-16px)] bg-[var(--borderMuted,var(--border))]/30 rounded-full"
        />
      )}

      {/* Icon dot */}
      <div
        className={`
          relative z-10 flex-shrink-0
          w-8 h-8 rounded-full
          flex items-center justify-center
          ${item.iconBgClass || 'bg-[var(--bgOverlay,var(--surface2))] text-[var(--textSecondary)]'}
        `}
      >
        {item.icon || (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-[var(--text)]">{item.title}</p>
          {item.timestamp && (
            <time className="text-xs text-[var(--textTertiary)] whitespace-nowrap flex-shrink-0 tabular-nums">
              {item.timestamp}
            </time>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-[var(--textSecondary)] mt-1">{item.description}</p>
        )}
      </div>
    </div>
  );
}

interface TimelineComposableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TimelineRoot({ children, className = '', ...props }: TimelineComposableProps) {
  return (
    <div className={`relative ${className}`} {...props}>
      {children}
    </div>
  );
}

interface TimelineItemCompProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  iconBgClass?: string;
  isLast?: boolean;
  children: ReactNode;
}

export function TimelineItemComp({
  icon,
  iconBgClass,
  isLast = false,
  children,
  className = '',
  ...props
}: TimelineItemCompProps) {
  return (
    <div className={`relative flex gap-4 pb-8 last:pb-0 ${className}`} {...props}>
      {!isLast && (
        <div className="absolute left-[15px] top-8 w-0.5 h-[calc(100%-16px)] bg-[var(--borderMuted,var(--border))]/30 rounded-full" />
      )}
      <div
        className={`
          relative z-10 flex-shrink-0
          w-8 h-8 rounded-full
          flex items-center justify-center
          ${iconBgClass || 'bg-[var(--bgOverlay,var(--surface2))] text-[var(--textSecondary)]'}
        `}
      >
        {icon || <div className="w-2 h-2 rounded-full bg-current" />}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {children}
      </div>
    </div>
  );
}
