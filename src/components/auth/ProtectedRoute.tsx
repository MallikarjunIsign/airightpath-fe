import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { ROUTES } from '@/config/routes';
import { AuthLoadingScreen } from './AuthLoadingScreen';
import type { RoleName } from '@/config/roles';
import type { PermissionName } from '@/config/permissions';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: RoleName[];
  requiredPermissions?: PermissionName[];
}

export function ProtectedRoute({ children, allowedRoles, requiredPermissions }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasAnyRole, hasAnyPermission } = useRbac();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    // Hand login a plain path string — it navigates straight to it after a
    // successful sign-in.
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={ROUTES.PUBLIC.LOGIN} state={{ from }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return <Navigate to={ROUTES.ERRORS.FORBIDDEN} replace />;
  }

  if (requiredPermissions && requiredPermissions.length > 0 && !hasAnyPermission(requiredPermissions)) {
    return <Navigate to={ROUTES.ERRORS.FORBIDDEN} replace />;
  }

  return <>{children}</>;
}
