import { UserPlus } from 'lucide-react';
import { hasReferral } from '@/utils/referral.utils';

interface ReferralFieldsProps {
  referralName?: string | null;
  referralId?: string | null;
  /**
   * When true, always render both fields (showing "Not provided" if empty) so a
   * reviewer can see referral status at a glance. When false (default), render
   * nothing unless a referral exists — keeps candidate-facing panels clean.
   */
  alwaysShow?: boolean;
}

/**
 * Renders Referral Name / Referral ID as two grid items matching the existing
 * "icon + label + value" detail-panel pattern.
 */
export function ReferralFields({
  referralName,
  referralId,
  alwaysShow = false,
}: Readonly<ReferralFieldsProps>) {
  if (!alwaysShow && !hasReferral(referralName, referralId)) return null;

  const fallback = alwaysShow ? 'Not provided' : '—';

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <UserPlus size={16} className="text-[var(--primary)] flex-shrink-0" />
        <div>
          <p className="text-[var(--textTertiary)] text-xs">Referral Name</p>
          <p className="text-[var(--text)] font-medium">{referralName?.trim() || fallback}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <UserPlus size={16} className="text-[var(--primary)] flex-shrink-0" />
        <div>
          <p className="text-[var(--textTertiary)] text-xs">Referral ID</p>
          <p className="text-[var(--text)] font-medium">{referralId?.trim() || fallback}</p>
        </div>
      </div>
    </>
  );
}
