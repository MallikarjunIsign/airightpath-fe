import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getDefaultDashboard } from '@/config/routes';
import { AuthLoadingScreen } from './AuthLoadingScreen';
import type { ReactNode } from 'react';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

/**
 * Mirror of ProtectedRoute for pages that only make sense signed out — the
 * landing page, login, register. A signed-in user is sent to their role's
 * dashboard instead of the marketing/login home.
 *
 * The isLoading gate matters: on a hard refresh the session is restored
 * asynchronously, so without it these pages would render for a beat and the
 * user would see the login home before being bounced to their dashboard.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { isAuthenticated, isLoading, roles } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={getDefaultDashboard(roles)} replace />;
  }

  return <>{children}</>;
}
