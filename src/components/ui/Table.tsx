import { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ children, className = '', ...props }: TableProps) {
  return (
    <div
      className="
        w-full overflow-x-auto scrollbar-thin
        bg-[var(--cardBg)]
        border border-[var(--borderMuted,var(--cardBorder))]
        rounded-2xl
        shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
      "
    >
      <table className={`w-full border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`
        bg-[var(--bgSubtle,var(--surface1))]
        sticky top-0 z-10
        ${className}
      `}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({ children, className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-[var(--borderMuted,var(--border))]/50 ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`
        transition-colors duration-150
        hover:bg-[var(--bgSubtle,var(--surface1))]/50
        ${className}
      `}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`
        px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider
        text-[var(--textTertiary)] font-heading
        first:rounded-tl-2xl last:rounded-tr-2xl
        ${className}
      `}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`
        px-4 py-4 text-sm text-[var(--text)]
        ${className}
      `}
      {...props}
    >
      {children}
    </td>
  );
}
