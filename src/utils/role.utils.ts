import type { RoleName } from '@/config/roles';

/**
 * Reading role names off an API payload.
 *
 * Roles arrive in more than one spelling: Spring Security's `ROLE_ADMIN`
 * convention, the bare enum name `ADMIN`, and occasionally lower case. A screen
 * that filters on one spelling silently shows nothing for the others, so every
 * comparison goes through here.
 *
 * Lives in a util rather than beside the badge component so both the filter and
 * the badges use one definition — and so exporting it does not put a non-component
 * export in a component file.
 */
export function normalizeRoleName(role: string): string {
  return role
    .replace(/^ROLE_/i, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Whether a user's role list includes the given role, whatever its spelling. */
export function hasRoleNamed(roles: string[] | undefined, target: RoleName): boolean {
  if (!roles) return false;
  return roles.some((role) => normalizeRoleName(role) === target);
}
