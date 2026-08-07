import { UserCheck, UserX, Clock, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { hasReferral, referralStatusLabel } from '@/utils/referral.utils';
import type { JobApplicationDTO } from '@/types/job.types';

type Referral = Pick<JobApplicationDTO, 'referralName' | 'referralId' | 'referralStatus'>;

/**
 * Whether a candidate came through a referral, said in one glance.
 *
 * A bare name (or a dash) in a Referral column reads as missing data rather
 * than "this person applied directly", and it hides the part that actually
 * matters to the admin: whether the referral has been verified yet.
 */
export function ReferralTag({
  candidate,
  className = '',
}: Readonly<{ candidate: Referral; className?: string }>) {
  const referred = hasReferral(candidate.referralName, candidate.referralId);

  if (!referred) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--textTertiary)] ${className}`}
        title="Applied directly — no referral"
      >
        <User size={13} className="flex-shrink-0" />
        Direct
      </span>
    );
  }

  const status = (candidate.referralStatus || 'PENDING').toUpperCase();
  const name = candidate.referralName?.trim() || candidate.referralId?.trim() || '';

  const variant = (() => {
    if (status === 'VERIFIED') return 'success' as const;
    if (status === 'REJECTED') return 'error' as const;
    return 'warning' as const;
  })();

  const icon = (() => {
    if (status === 'VERIFIED') return <UserCheck size={11} />;
    if (status === 'REJECTED') return <UserX size={11} />;
    return <Clock size={11} />;
  })();

  return (
    <span className={`inline-flex flex-col items-start gap-1 min-w-0 ${className}`}>
      <Badge variant={variant} size="sm">
        <span className="flex items-center gap-1">
          {icon}
          Referred · {referralStatusLabel(candidate.referralStatus)}
        </span>
      </Badge>
      {name && (
        <span className="text-xs text-[var(--textSecondary)] break-words" title={`Referred by ${name}`}>
          by {name}
        </span>
      )}
    </span>
  );
}
