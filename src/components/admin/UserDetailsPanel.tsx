import { Mail, Phone, Shield, UserCheck, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { UserRoleBadges } from './UserRoleBadges';
import { formatServerDateTime } from '@/utils/format.utils';
import type { UsersDto } from '@/types/user.types';

/**
 * Everything the API knows about one user, for the panel beside the list.
 *
 * The list shows the five columns that fit; this shows the rest — the alternate
 * number, the timestamps, the full role set — so checking one detail about one
 * person no longer means widening a table that already scrolls.
 *
 * Deliberately not rendered from a loop over the object's own keys: `UsersDto`
 * has carried fields that must never reach a screen, so every row here is one
 * someone chose to show.
 */
export function UserDetailsPanel({
  user,
  isToggling,
  onToggleStatus,
  onClose,
  showClose = true,
  canChangeStatus = true,
}: Readonly<{
  user: UsersDto;
  isToggling: boolean;
  onToggleStatus: () => void;
  onClose: () => void;
  /** Hidden inside a modal, which brings its own dismiss control. */
  showClose?: boolean;
  /**
   * False for a viewer who cannot enable or disable accounts. The details stay
   * fully readable; only the action goes, since the server would refuse it.
   */
  canChangeStatus?: boolean;
}>) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Avatar firstName={user.firstName} lastName={user.lastName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)] break-words">{fullName || '—'}</p>
          <p className="text-sm text-[var(--textSecondary)] break-all">{user.email}</p>
          <div className="mt-2">
            <Badge variant={user.enabled ? 'success' : 'error'} size="sm">
              {user.enabled ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
        {showClose && (
          <button
            onClick={onClose}
            aria-label="Close details"
            className="flex-shrink-0 rounded-lg p-1.5 text-[var(--textSecondary)] transition-colors hover:bg-[var(--surface1)] hover:text-[var(--text)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <Section title="Access">
        <Row icon={<Shield size={14} />} label="Roles">
          <UserRoleBadges roles={user.roles} />
        </Row>
      </Section>

      <Section title="Contact">
        <Row icon={<Mail size={14} />} label="Email" value={user.email} breakAll />
        <Row icon={<Phone size={14} />} label="Mobile" value={user.mobileNumber} />
        {/* Only shown when there is one — an empty row reads as missing data
            rather than as a field this person never filled in. */}
        {user.alternativeMobileNumber && (
          <Row icon={<Phone size={14} />} label="Alternate" value={user.alternativeMobileNumber} />
        )}
      </Section>

      {(user.createdAt || user.updatedAt || user.id !== undefined) && (
        <Section title="Account">
          {user.createdAt && <Row label="Registered" value={formatServerDateTime(user.createdAt)} />}
          {user.updatedAt && <Row label="Last updated" value={formatServerDateTime(user.updatedAt)} />}
          {user.id !== undefined && <Row label="User ID" value={String(user.id)} />}
        </Section>
      )}

      {canChangeStatus && (
        <div className="border-t border-[var(--borderMuted,var(--border))] pt-4">
          <Button
            variant={user.enabled ? 'danger' : 'primary'}
            size="sm"
            className="w-full"
            isLoading={isToggling}
            leftIcon={user.enabled ? <UserX size={14} /> : <UserCheck size={14} />}
            onClick={onToggleStatus}
          >
            {user.enabled ? 'Deactivate account' : 'Activate account'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--textTertiary)]">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  children,
  breakAll,
}: Readonly<{
  icon?: React.ReactNode;
  label: string;
  value?: string;
  children?: React.ReactNode;
  breakAll?: boolean;
}>) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 flex-shrink-0 text-[var(--textTertiary)]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--textTertiary)]">{label}</p>
        {children ?? (
          <p className={`text-sm text-[var(--text)] ${breakAll ? 'break-all' : 'break-words'}`}>
            {value || '—'}
          </p>
        )}
      </div>
    </div>
  );
}
