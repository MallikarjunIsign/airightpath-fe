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
