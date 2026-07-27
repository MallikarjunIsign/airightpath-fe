import { UserPlus } from 'lucide-react';
import { hasReferral } from '@/utils/referral.utils';

interface ReferralFieldsProps {
  referralName?: string | null;
  referralId?: string | null;
}

/**
 * Renders Referral Name / Referral ID as two grid items matching the existing
 * "icon + label + value" detail-panel pattern. Renders nothing when neither
 * value is present, so panels stay clean for non-referred applications.
 */
export function ReferralFields({ referralName, referralId }: Readonly<ReferralFieldsProps>) {
  if (!hasReferral(referralName, referralId)) return null;

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <UserPlus size={16} className="text-[var(--primary)] flex-shrink-0" />
        <div>
          <p className="text-[var(--textTertiary)] text-xs">Referral Name</p>
          <p className="text-[var(--text)] font-medium">{referralName?.trim() || '—'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <UserPlus size={16} className="text-[var(--primary)] flex-shrink-0" />
        <div>
          <p className="text-[var(--textTertiary)] text-xs">Referral ID</p>
          <p className="text-[var(--text)] font-medium">{referralId?.trim() || '—'}</p>
        </div>
      </div>
    </>
  );
}
