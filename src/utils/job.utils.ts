/**
 * Job type handling.
 *
 * `jobType` is stored as free text and rows created before the form used a
 * fixed dropdown carry every spelling of the same thing — "Full-Time",
 * "Full-time", "full time". Anything that groups or filters by type must
 * canonicalise first, or the same type shows up as two entries.
 */

/** The types the create/edit form offers. Everything else is legacy or custom. */
export const JOB_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Internship'] as const;

export type JobType = (typeof JOB_TYPES)[number];

/** Label shown when a job has no type at all. */
export const JOB_TYPE_OTHER = 'Other';

/** "Full-time", "full time", "FULLTIME" → the same key. */
function typeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CANONICAL_BY_KEY = new Map<string, string>(JOB_TYPES.map((t) => [typeKey(t), t]));

/** Title-case a free-text type we don't recognise, so it at least reads well. */
function titleCase(value: string): string {
  return value.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The display label for a job type: one of `JOB_TYPES` when it matches any
 * spelling of them, `Other` when blank, otherwise the value title-cased —
 * unrecognised types stay visible rather than being lumped into "Other".
 */
export function canonicalJobType(value?: string): string {
  const raw = value?.trim();
  if (!raw) return JOB_TYPE_OTHER;
  return CANONICAL_BY_KEY.get(typeKey(raw)) ?? titleCase(raw);
}

/** True when two free-text job types mean the same thing. */
export function isSameJobType(a?: string, b?: string): boolean {
  return canonicalJobType(a) === canonicalJobType(b);
}

// ── Deadlines ──────────────────────────────────────────────────────────

/** A deadline this many days away or nearer is flagged as closing soon. */
export const DEADLINE_SOON_DAYS = 2;

/**
 * Whole days from today until the deadline: 0 is today, negative is past.
 * Compared at day granularity, the same way expiry is judged, so the two
 * never disagree about a job due today.
 */
export function daysUntilDeadline(deadline?: string): number | null {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return null;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

export type DeadlineUrgency = 'past' | 'soon' | 'later';

/** `soon` covers today through `DEADLINE_SOON_DAYS` days out. */
export function deadlineUrgency(deadline?: string): DeadlineUrgency {
  const days = daysUntilDeadline(deadline);
  if (days === null) return 'later';
  if (days < 0) return 'past';
  return days <= DEADLINE_SOON_DAYS ? 'soon' : 'later';
}

/** Amber when the deadline is within two days, green while there is time. */
export function deadlineColor(deadline?: string): string {
  switch (deadlineUrgency(deadline)) {
    case 'past':
      return 'var(--error)';
    case 'soon':
      return 'var(--warning)';
    default:
      return 'var(--success)';
  }
}

/** "Today" / "Tomorrow" / "in 5 days" — context for the coloured date. */
export function deadlineLabel(deadline?: string): string {
  const days = daysUntilDeadline(deadline);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}
