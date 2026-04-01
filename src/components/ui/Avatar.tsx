import { HTMLAttributes, useState } from 'react';
import { getInitials } from '@/utils/format.utils';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function Avatar({
  src,
  firstName,
  lastName,
  alt,
  size = 'md',
  className = '',
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(firstName, lastName);

  const sizes = {
    xs: 'w-6 h-6 text-[0.625rem]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const showImage = src && !imgError;

  return (
    <div
      className={`
        relative inline-flex items-center justify-center
        rounded-full overflow-hidden flex-shrink-0
        gradient-brand text-white font-semibold
        ring-2 ring-[var(--bgCanvas,var(--background))]/80
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Avatar'}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  max?: number;
  children: React.ReactNode;
}

export function AvatarGroup({ max = 4, children, className = '', ...props }: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visible = childArray.slice(0, max);
  const remaining = childArray.length - max;

  return (
    <div className={`flex -space-x-2 ${className}`} {...props}>
      {visible.map((child, index) => (
        <div key={index} className="ring-2 ring-[var(--bgCanvas,var(--cardBg))] rounded-full">
          {child}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="
            ring-2 ring-[var(--bgCanvas,var(--cardBg))] rounded-full
            w-10 h-10
            bg-[var(--bgOverlay,var(--surface2))]
            text-[var(--textSecondary)] text-sm font-semibold
            inline-flex items-center justify-center
          "
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
