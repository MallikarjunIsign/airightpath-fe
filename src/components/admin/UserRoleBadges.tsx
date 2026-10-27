import { Badge } from '@/components/ui/Badge';
import { normalizeRoleName } from '@/utils/role.utils';
import type { RoleName } from '@/config/roles';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary';

/**
 * How each role reads on screen.
 *
 * Super admin is the most privileged account in the system, so it gets the
 * loudest colour — someone scanning a list for "who can do anything here?"
 * should not have to read the words. USER is deliberately labelled "Candidate":
 * that is what a USER is in this product, and the stored enum name is an
 * implementation detail nobody administering the system thinks in.
 */
const ROLE_STYLE: Record<RoleName, { label: string; variant: BadgeVariant }> = {
  SUPER_ADMIN: { label: 'Super Admin', variant: 'error' },
  ADMIN: { label: 'Admin', variant: 'primary' },
  USER: { label: 'Candidate', variant: 'secondary' },
};

function isKnownRole(role: string): role is RoleName {
  return role in ROLE_STYLE;
}

/**
 * A user's roles as badges.
 *
 * Three states, all real and all different: `undefined` means this payload
 * never carried roles (an endpoint that does not look them up), an empty array
 * means the account genuinely holds none, and a populated array is the roles.
 * Collapsing the first two into one dash would tell an admin an account has no
 * access when the truth is that nobody asked.
 */
export function UserRoleBadges({ roles }: Readonly<{ roles?: string[] }>) {
  if (roles === undefined) {
    return <span className="text-sm text-[var(--textTertiary)]">Not loaded</span>;
  }
  if (roles.length === 0) {
    return <span className="text-sm text-[var(--textTertiary)]">No role</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => {
        const normalized = normalizeRoleName(role);
        // An unknown role is shown as stored rather than hidden: a role the UI
        // has not been taught about is exactly the thing an admin needs to see.
        const style = isKnownRole(normalized)
          ? ROLE_STYLE[normalized]
          : { label: normalized, variant: 'default' as BadgeVariant };
        return (
          <Badge key={role} variant={style.variant} size="sm">
            {style.label}
          </Badge>
        );
      })}
    </div>
  );
}
