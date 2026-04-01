import { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'ghost';
}

export function Card({
  children,
  padding = 'md',
  hover = false,
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const paddings = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
  };

  const variants = {
    default: `
      bg-[var(--cardBg)]
      border border-[var(--borderMuted,var(--cardBorder))]
      shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
    `,
    elevated: `
      bg-[var(--bgElevated,var(--cardBg))]
      border border-[var(--borderMuted,transparent)]
      shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08)]
    `,
    ghost: `
      bg-transparent
      border border-transparent
    `,
  };

  return (
    <div
      className={`
        rounded-2xl
        transition-all duration-200
        ${paddings[padding]}
        ${variants[variant]}
        ${hover
          ? 'hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:border-[var(--borderHover,var(--border))] cursor-pointer'
          : ''
        }
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-xl font-semibold text-[var(--text)] font-heading ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm text-[var(--textSecondary)] mt-1 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mt-4 pt-4 flex items-center gap-3 border-t border-[var(--borderMuted,var(--border))]/50 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
