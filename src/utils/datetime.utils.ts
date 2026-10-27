/** Current local date-time as `YYYY-MM-DDTHH:mm` for a datetime-local min/value. */
export function nowDateTimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Today's local date as `YYYY-MM-DD` for a date-input min/value. */
export function todayDateLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** True when the given datetime-local/date string is strictly before now. */
export function isPast(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

/**
 * A `YYYY-MM-DDTHH:mm` value as a human schedule line —
 * "Mon, 10 Aug 2026, 02:30 PM". Used for the preview of what a candidate will
 * read in a scheduling email, so the admin never has to decode the raw value.
 */
export function formatScheduleForEmail(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
