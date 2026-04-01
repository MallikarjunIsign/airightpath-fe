import type { ReactNode } from 'react';
import { useRbac } from '@/hooks/useRbac';
import type { RoleName } from '@/config/roles';

interface RoleGateProps {
  children: ReactNode;
  roles: RoleName[];
  fallback?: ReactNode;
}

export function RoleGate({ children, roles, fallback = null }: RoleGateProps) {
  const { hasAnyRole } = useRbac();

  if (!hasAnyRole(roles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
