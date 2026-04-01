import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with proper conflict resolution.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-blue-500', className)
 *   cn('text-sm font-medium', { 'text-red-500': hasError })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
