import { HTMLAttributes, ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps extends HTMLAttributes<HTMLDivElement> {
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: ReactNode;
}

export function Tooltip({
  content,
  position = 'top',
  delay = 200,
  children,
  className = '',
  ...props
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      {...props}
    >
      {children}
      {isVisible && (
        <div
          className={`
            absolute z-[110] ${positions[position]}
            pointer-events-none
            animate-fade-in
          `}
          role="tooltip"
        >
          <div
            className="
              relative px-3 py-1.5 rounded-lg
              bg-[var(--bgWash,var(--surface3))]
              text-[var(--text)] text-xs font-medium
              whitespace-nowrap
              shadow-[0_4px_16px_rgba(0,0,0,0.16),0_1px_4px_rgba(0,0,0,0.1)]
              border border-[var(--borderMuted,transparent)]/30
            "
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
