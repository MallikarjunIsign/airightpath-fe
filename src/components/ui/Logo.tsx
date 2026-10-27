import type { ImgHTMLAttributes } from 'react';
import logo from '@/assets/logo.png';

interface LogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  className?: string;
}

/**
 * Rightpath brand logo (wordmark + pin icon).
 * Default height fits a standard header/sidebar row; override via className.
 */
export function Logo({ className = 'h-9 w-auto', ...props }: LogoProps) {
  return <img src={logo} alt="Rightpath" className={`object-contain ${className}`} {...props} />;
}
