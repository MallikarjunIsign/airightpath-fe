import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDate(dateStr: string, pattern = 'MMM dd, yyyy'): string {
  try {
    return format(parseISO(dateStr), pattern);
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string): string {
  return formatDate(dateStr, 'MMM dd, yyyy HH:mm');
}

/**
 * A timestamp the server stamped, shown in the reader's own timezone.
 *
 * The server writes its `LocalDateTime` columns bare — `2026-08-14T08:23:27` —
 * and they are UTC. `parseISO` reads a bare stamp as local time, so putting one
 * through {@link formatDateTime} prints the UTC digits unchanged and an admin in
 * IST reads 08:23 for something that happened at 13:53 their time.
 *
 * Use this for anything the server recorded: when a paper was assigned, opened
 * or handed in. NOT for the exam window: `startTime` and `deadline` are the
 * wall-clock a recruiter typed into the scheduler and are stored as typed, so
 * they must be shown back exactly as typed — {@link formatDateTime} does that.
 */
export function formatServerDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(dateStr) ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  try {
    return format(parseISO(zoned), 'MMM dd, yyyy HH:mm');
  } catch {
    return dateStr;
  }
}

export function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() || '';
  const l = lastName?.charAt(0)?.toUpperCase() || '';
  return f + l || '?';
}

export function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
