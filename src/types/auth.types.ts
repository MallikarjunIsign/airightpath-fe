import type { RoleName } from '@/config/roles';
import type { PermissionName } from '@/config/permissions';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserInfo {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  mobileNumber: string | null;
  alternativeMobileNumber: string | null;
}

/**
 * What login and refresh answer with.
 *
 * `accessToken` is only here because the server still sends it (its `returnTokenInBody` flag, to be turned off).
 * Nothing reads it: the session is the cookie, and only `expiresIn` is used, to refresh ahead of expiry.
 */
export interface AccessTokenData {
  /** @deprecated Do not read. The session is carried by an HttpOnly cookie. */
  accessToken?: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginData extends AccessTokenData {
  user: UserInfo;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  success: boolean;
  data: LoginData;
  timestamp?: string;
}

export interface MeResponse {
  user: UserInfo;
  roles: string[];
  permissions: string[];
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  password: string;
}

export interface GenerateOtpRequest {
  type: 'email' | 'mobile';
  value: string;
}

export interface ValidateOtpRequest {
  otp: string;
  email?: string | null;
  mobile?: string | null;
}

export interface UpdatePasswordRequest {
  email?: string;
  mobile?: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  email: string;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthState {
  user: UserInfo | null;
  roles: RoleName[];
  permissions: PermissionName[];
  isAuthenticated: boolean;
  isLoading: boolean;
}
