import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { ENV } from "@/config/env";
import { ENDPOINTS } from "@/config/api.endpoints";
import { getErrorMessage } from "@/config/error-messages";
import { dispatchErrorToast } from "@/config/toast-events";
import type { ApiErrorEnvelope } from "@/types/api.types";

// ── In-memory token store ────────────────────────────────────────────
let accessToken: string | null = null;

// BroadcastChannel for cross-tab auth sync (replaces localStorage events)
let authChannel: BroadcastChannel | null = null;
try {
  authChannel = new BroadcastChannel("rightpath_auth");
} catch {
  // BroadcastChannel not supported — cross-tab sync disabled
}

export { authChannel };

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  // Pure store. Deliberately does NOT broadcast: silent token rotation
  // (e.g. via /refresh) must not signal other tabs, or the receiving tab's
  // bootstrap → refresh → setAccessToken path would re-broadcast and create a
  // cross-tab feedback loop. Use broadcastAuthChange() for user-initiated auth.
  accessToken = token;
}

export function clearTokens(): void {
  // Pure store — see setAccessToken. Broadcast logout explicitly via
  // broadcastAuthChange('logout') only for genuine session-end transitions.
  accessToken = null;
}

// Explicitly notify other tabs about a user-initiated auth change (login on
// success, logout, or a dead session). Kept separate from token storage so
// silent rotations never trigger cross-tab work.
export function broadcastAuthChange(type: "login" | "logout"): void {
  try {
    authChannel?.postMessage({ type });
  } catch {
    // Silently ignore — cross-tab sync is best-effort
  }
}

// ── Axios instance ───────────────────────────────────────────────────
const api = axios.create({
  baseURL: ENV.API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ── Endpoints that skip the auth header ──────────────────────────────
const PUBLIC_PATHS = [
  ENDPOINTS.AUTH.LOGIN,
  ENDPOINTS.AUTH.REGISTER,
  ENDPOINTS.AUTH.REFRESH,
  ENDPOINTS.AUTH.LOGOUT,
  ENDPOINTS.AUTH.GENERATE_OTP,
  ENDPOINTS.AUTH.VALIDATE_OTP,
  ENDPOINTS.AUTH.UPDATE_PASSWORD,
];

function isPublicPath(url?: string): boolean {
  if (!url) return false;
  return PUBLIC_PATHS.some((p) => url.includes(p));
}

// ── Request interceptor: attach Bearer token ─────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && !isPublicPath(config.url)) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 + refresh ───────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const status = error.response?.status;

    // ── 401 handling for non-public paths: attempt silent refresh ─────
    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isPublicPath(originalRequest.url)
    ) {
      const errorCode = (error.response?.data as ApiErrorEnvelope | undefined)
        ?.code;
      if (
        !errorCode ||
        errorCode === "AUTH_INVALID_TOKEN" ||
        errorCode === "AUTH_UNAUTHORIZED"
      ) {
        if (isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const response = await axios.post(
            `${ENV.API_BASE_URL}${ENDPOINTS.AUTH.REFRESH}`,
            {},
            { withCredentials: true },
          );
          const newToken = response.data?.data?.accessToken;
          if (newToken) {
            setAccessToken(newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            processQueue(null, newToken);
            return api(originalRequest);
          }
          throw new Error("No token in refresh response");
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokens();
          broadcastAuthChange("logout");
          dispatchErrorToast(getErrorMessage("AUTH_INVALID_REFRESH"));
          window.dispatchEvent(new CustomEvent("auth:forceLogout"));
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // ── Auto-toast for all other errors ──────────────────────────────
    if (!originalRequest?._skipErrorToast) {
      const data = error.response?.data as ApiErrorEnvelope | undefined;
      const hasStructuredError =
        !!data?.code || typeof data?.message === "string";
      if (hasStructuredError) {
        // Prefer the server's specific error (mapped if known) even for 5xx, so
        // failures like AI_SERVICE_ERROR aren't masked by a generic message.
        dispatchErrorToast(extractApiError(error).message);
      } else if (status && status >= 500) {
        dispatchErrorToast(getErrorMessage("INTERNAL_ERROR"));
      } else {
        dispatchErrorToast(extractApiError(error).message);
      }
    }

    return Promise.reject(error);
  },
);

// ── Error extraction helper ──────────────────────────────────────────
export function extractApiError(error: unknown): {
  code: string;
  message: string;
} {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorEnvelope | undefined;
    // V2 format: flat object with code field
    if (data?.code) {
      return {
        code: data.code,
        message: getErrorMessage(data.code, data.message),
      };
    }
    // Legacy format: { message, timestamp } — no code
    if (data && typeof (data as Record<string, unknown>).message === "string") {
      return {
        code: `HTTP_${error.response?.status}`,
        message: (data as Record<string, unknown>).message as string,
      };
    }
    if (error.code === "ECONNABORTED") {
      return {
        code: "TIMEOUT_ERROR",
        message: getErrorMessage("TIMEOUT_ERROR"),
      };
    }
    if (!error.response) {
      return {
        code: "NETWORK_ERROR",
        message: getErrorMessage("NETWORK_ERROR"),
      };
    }
    return {
      code: `HTTP_${error.response.status}`,
      message: error.response.statusText || getErrorMessage(),
    };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : getErrorMessage(),
  };
}

export default api;
