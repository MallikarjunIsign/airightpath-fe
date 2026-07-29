import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { authService } from '@/services/auth.service';
import { setAccessToken, getAccessToken, clearTokens, broadcastAuthChange, authChannel } from '@/services/api.service';
import { isJwtExpired } from '@/utils/jwt.utils';
import type { RoleName } from '@/config/roles';
import type { PermissionName } from '@/config/permissions';
import type { UserInfo, LoginRequest, RegisterRequest } from '@/types/auth.types';

interface AuthContextType {
  user: UserInfo | null;
  roles: RoleName[];
  permissions: PermissionName[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<{ roles: RoleName[] }>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeRole(role: string): RoleName {
  return role
    .replace(/^ROLE_/i, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_') as RoleName;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [roles, setRoles] = useState<RoleName[]>([]);
  const [permissions, setPermissions] = useState<PermissionName[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const loadMe = useCallback(async () => {
    try {
      const response = await authService.me();
      const me = response.data.data;
      setUser(me.user);
      const normalizedRoles = me.roles.map(normalizeRole);
      setRoles(normalizedRoles);
      setPermissions(me.permissions as PermissionName[]);
      return me;
    } catch {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      clearTokens();
      return null;
    }
  }, []);

  const bootstrapSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAccessToken();

      if (token && !isJwtExpired(token)) {
        await loadMe();
        return;
      }

      try {
        const refreshResponse = await authService.refresh();
        const newToken = refreshResponse.data?.data?.accessToken;
        if (newToken) {
          setAccessToken(newToken);
          await loadMe();
          return;
        }
      } catch {
        // Refresh failed
      }

      setUser(null);
      setRoles([]);
      setPermissions([]);
      clearTokens();
    } finally {
      setIsLoading(false);
    }
  }, [loadMe]);

  // Bootstrap on mount — acquire the access token (via refresh) and load the
  // user BEFORE any protected page renders, so pages never fire token-less
  // requests that would 401-storm and trip refresh-token reuse detection.
  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'logout') {
        // Clear in-memory token in this tab as well
        setAccessToken(null);
        setUser(null);
        setRoles([]);
        setPermissions([]);
      } else if (e.data?.type === 'login') {
        // Another tab logged in. Only adopt the shared (refresh-cookie) session
        // if this tab has no token yet — prevents redundant bootstraps. Because
        // setAccessToken no longer re-broadcasts, this cannot feed back into a loop.
        if (!getAccessToken()) {
          bootstrapSession();
        }
      }
    };

    const handleForceLogout = () => {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      clearTokens();
    };

    authChannel?.addEventListener('message', handleMessage);
    window.addEventListener('auth:forceLogout', handleForceLogout);
    return () => {
      authChannel?.removeEventListener('message', handleMessage);
      window.removeEventListener('auth:forceLogout', handleForceLogout);
    };
  }, [bootstrapSession]);

  const login = useCallback(
    async (data: LoginRequest): Promise<{ roles: RoleName[] }> => {
      const response = await authService.login(data);
      const loginData = response.data.data;
      setAccessToken(loginData.accessToken);
      setUser(loginData.user);
      const normalizedRoles = loginData.roles.map(normalizeRole);
      setRoles(normalizedRoles);
      setPermissions(loginData.permissions as PermissionName[]);
      // Signal other tabs exactly once for this user-initiated login.
      broadcastAuthChange('login');
      return { roles: normalizedRoles };
    },
    []
  );

  const register = useCallback(async (data: RegisterRequest) => {
    await authService.register(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Best-effort logout
    } finally {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      clearTokens();
      // Signal other tabs to tear down their session as well.
      broadcastAuthChange('logout');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        permissions,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
