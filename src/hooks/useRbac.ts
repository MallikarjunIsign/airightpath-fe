import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { RoleName } from '@/config/roles';
import type { PermissionName } from '@/config/permissions';

export function useRbac() {
  const { roles, permissions } = useAuth();

  const hasRole = useCallback(
    (role: RoleName) => roles.includes(role),
    [roles]
  );

  const hasAnyRole = useCallback(
    (checkRoles: RoleName[]) => checkRoles.some((r) => roles.includes(r)),
    [roles]
  );

  const hasPermission = useCallback(
    (permission: PermissionName) => permissions.includes(permission),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (checkPermissions: PermissionName[]) => checkPermissions.some((p) => permissions.includes(p)),
    [permissions]
  );

  const can = hasPermission;

  return { roles, permissions, hasRole, hasAnyRole, hasPermission, hasAnyPermission, can };
}
