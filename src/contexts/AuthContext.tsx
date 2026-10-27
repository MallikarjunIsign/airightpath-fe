import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { authService } from '@/services/auth.service';
import {
  setAccessToken,
  getAccessToken,
  clearTokens,
  broadcastAuthChange,
  refreshAccessToken,
  isAuthRejection,
  authChannel,
} from '@/services/api.service';
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

/** Breathing room before retrying a /me that failed for a non-auth reason. */
const RETRY_DELAY_MS = 600;

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

  const clearSession = useCallback(() => {
    setUser(null);
    setRoles([]);
    setPermissions([]);
    clearTokens();
  }, []);

  /**
   * Loads the signed-in user, and decides what a failure means.
   *
   * Any error used to end the session here, so a dropped connection or a 5xx on
   * one request threw away a perfectly good login. Only the server rejecting
   * the token means the session is over — everything else earns one retry and
   * then leaves the stored token alone, so the next page load can recover it.
   */
  const loadMe = useCallback(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await authService.me();
        const me = response.data.data;
        setUser(me.user);
        const normalizedRoles = me.roles.map(normalizeRole);
        setRoles(normalizedRoles);
        setPermissions(me.permissions as PermissionName[]);
        return me;
      } catch (error) {
        if (isAuthRejection(error)) {
          clearSession();
          return null;
        }
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    return null;
  }, [clearSession]);

  const bootstrapSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAccessToken();

      if (token && !isJwtExpired(token)) {
        await loadMe();
        return;
      }

      try {
        // Shared single-flight refresh. Calling authService.refresh() directly
        // here bypassed the interceptor's guard, so a page load could spend the
        // rotated token twice — and the server reads a second use as theft and
        // revokes the whole session, logging the user out on every refresh.
        await refreshAccessToken();
        await loadMe();
        return;
      } catch {
        // No usable refresh cookie — fall through to a signed-out state.
      }

      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [loadMe, clearSession]);

  // Bootstrap on mount — acquire the access token (via refresh) and load the
  // user BEFORE any protected page renders, so pages never fire token-less
  // requests that would 401-storm and trip refresh-token reuse detection.
  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // Read inside the cross-tab listener without re-subscribing on every change.
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'logout') {
        clearSession();
      } else if (e.data?.type === 'login') {
        // Another tab logged in. Adopt the session only when this tab is still
        // signed out — the access token is shared storage now, so holding one
        // says nothing about whether this tab has loaded its user yet.
        if (!isAuthenticatedRef.current) {
          bootstrapSession();
        }
      }
    };

    const handleForceLogout = () => {
      clearSession();
    };

    authChannel?.addEventListener('message', handleMessage);
    window.addEventListener('auth:forceLogout', handleForceLogout);
    return () => {
      authChannel?.removeEventListener('message', handleMessage);
      window.removeEventListener('auth:forceLogout', handleForceLogout);
    };
  }, [bootstrapSession, clearSession]);

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
