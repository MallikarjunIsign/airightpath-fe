/** Whether an application carries any referral info. */
export function hasReferral(name?: string | null, id?: string | null): boolean {
  return Boolean(name?.trim() || id?.trim());
}

/** Single-line referral label for lists/tables: name → id → dash. */
export function referralDisplay(name?: string | null, id?: string | null): string {
  return name?.trim() || id?.trim() || '—';
}

/** Human label for the admin referral status (defaults to Pending). */
export function referralStatusLabel(status?: string | null): string {
  switch ((status || 'PENDING').toUpperCase()) {
    case 'VERIFIED':
      return 'Verified';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Pending';
  }
}
