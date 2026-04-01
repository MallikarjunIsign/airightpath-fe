import type { ReactNode } from 'react';
import { useRbac } from '@/hooks/useRbac';
import type { PermissionName } from '@/config/permissions';

interface PermissionGateProps {
  children: ReactNode;
  permissions: PermissionName[];
  fallback?: ReactNode;
}

export function PermissionGate({ children, permissions, fallback = null }: PermissionGateProps) {
  const { hasAnyPermission } = useRbac();

  if (!hasAnyPermission(permissions)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
