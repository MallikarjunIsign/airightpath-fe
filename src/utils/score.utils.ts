/** Tailwind text-color class for an ATS/match score (green ≥80, amber ≥60, else red). */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-[var(--success)]';
  if (score >= 60) return 'text-[var(--warning)]';
  return 'text-[var(--error)]';
}

/** Tailwind background-color class for an ATS/match score bar. */
export function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-[var(--success)]';
  if (score >= 60) return 'bg-[var(--warning)]';
  return 'bg-[var(--error)]';
}
