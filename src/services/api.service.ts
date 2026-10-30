import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { ENV } from "@/config/env";
import { ENDPOINTS } from "@/config/api.endpoints";
import { getErrorMessage } from "@/config/error-messages";
import { dispatchErrorToast } from "@/config/toast-events";
import type { ApiErrorEnvelope } from "@/types/api.types";

// ── The session lives in cookies, not in script ──────────────────────
//
// The server sets the access and refresh tokens as Secure, HttpOnly,
// SameSite=Strict cookies. Script cannot read them, and must not try: nothing
// here reads a token from a response body, stores one, or sends one in a header
// or a URL. The browser attaches the cookies to every call because every call
// is made with credentials (`withCredentials` below).
//
// Two things are kept in localStorage, and neither is a token: when the session
// was last refreshed, and how long an access token lives (the `expiresIn` the
// server reports). They exist for two reasons.
//   - Timing. The access token lasts minutes, so the page refreshes it a little
//     before it runs out, and a long interview never has a request fail midway.
//   - Not spending the refresh cookie twice. The server rotates it on every use
//     and treats a second use of the old one as theft, revoking the whole
//     session. The last-refresh time is shared between tabs, so a tab that wakes
//     up just after another one refreshed sees that and leaves the cookie alone.
const LAST_REFRESH_KEY = "rightpath.lastRefreshAt";
const LIFETIME_KEY = "rightpath.accessLifetimeMs";

/** Left by earlier versions, which kept the access token in script. Removed so none survives in a browser. */
const LEGACY_TOKEN_KEYS = ["rightpath.accessToken", "accessToken"];

/** A refresh this recent means the cookie is already new; spending it again would look like reuse. */
const RECENT_REFRESH_MS = 5_000;

/** How long before expiry the page refreshes ahead of time, at most. */
const REFRESH_AHEAD_MS = 60_000;

/** Private-mode browsers throw on Storage access, so everything here tolerates that. */
function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return memory[key] ?? null;
  }
}

function writeNumber(key: string, value: number | null): void {
  if (value === null) delete memory[key];
  else memory[key] = value;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // Storage blocked: the in-memory copy still serves this tab.
  }
}

/** The fallback when Storage is unavailable. */
const memory: Record<string, number> = {};

try {
  LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
} catch {
  // Nothing to clean where Storage is blocked.
}

// BroadcastChannel for cross-tab auth sync (replaces localStorage events)
let authChannel: BroadcastChannel | null = null;
try {
  authChannel = new BroadcastChannel("rightpath_auth");
} catch {
  // BroadcastChannel not supported — cross-tab sync disabled
}

export { authChannel };

// Explicitly notify other tabs about a user-initiated auth change (login on
// success, logout, or a dead session). Kept separate from the refresh timing so
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
  // Every call carries the session cookies. Without this the browser drops them
  // on a request to the API's own subdomain and every call answers 401.
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ── Endpoints that never trigger a refresh ───────────────────────────
//
// A 401 from these is the answer, not an expired session: wrong credentials on
// login, a dead refresh cookie on refresh. Refreshing in response would loop.
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

/** Code execution needs its own permission, so a 403 there gets its own wording. */
const COMPILE_PATHS = [ENDPOINTS.COMPILE, ENDPOINTS.COMPILER.RUN];

function isCompilePath(url?: string): boolean {
  if (!url) return false;
  return COMPILE_PATHS.some((p) => url.includes(p));
}

// ── Single-flight refresh ────────────────────────────────────────────
//
// The server rotates the refresh token on every use and treats a second
// presentation of an already-rotated token as theft: it revokes the whole
// session, not just that token. Two refreshes racing each other therefore log
// the user out. There is exactly one in flight at a time, and every caller
// awaits it.
let refreshPromise: Promise<void> | null = null;

const REFRESH_LOCK = "rightpath_auth_refresh";

/**
 * Runs `fn` with no other tab running it at the same time.
 *
 * The in-flight promise only serialises callers within one tab. Two tabs waking
 * together would each spend the refresh cookie. Web Locks are origin-wide, so
 * they serialise across tabs; without them (older browsers) the per-tab guard
 * and the shared last-refresh time are still better than nothing.
 */
function withRefreshLock(fn: () => Promise<void>): Promise<void> {
  const locks = navigator.locks;
  if (!locks?.request) return fn();
  return locks.request(REFRESH_LOCK, fn) as Promise<void>;
}

/** Spends the refresh cookie. The server answers with new cookies; only how long they last is read. */
function requestNewSession(): Promise<void> {
  // Bare axios, not `api`: the instance's own interceptor would try to refresh
  // a failing refresh, and recurse.
  return axios
    .post<{ data?: { expiresIn?: number } }>(
      `${ENV.API_BASE_URL}${ENDPOINTS.AUTH.REFRESH}`,
      {},
      { withCredentials: true },
    )
    .then((response) => {
      noteSession(response.data?.data?.expiresIn);
    });
}

/**
 * Refreshes the session, once, however many callers ask at the same time.
 *
 * Skips the call when the session was refreshed within `minGapMs`: by this tab a
 * moment ago, or by another tab. The cookie is then already new, so the caller
 * only has to try again.
 */
export function refreshSession(minGapMs: number = RECENT_REFRESH_MS): Promise<void> {
  refreshPromise ??= withRefreshLock(async () => {
    // Re-checked inside the lock: whoever held it before us may already have
    // rotated the cookie, and spending it again is exactly the double use the
    // server revokes sessions for.
    const last = readNumber(LAST_REFRESH_KEY);
    if (last && Date.now() - last < minGapMs) return;
    await requestNewSession();
  }).finally(() => {
    // Cleared once settled so a later, genuine refresh can start. Callers
    // already holding this promise are unaffected.
    refreshPromise = null;
  });

  return refreshPromise;
}

// ── Refreshing ahead of expiry ───────────────────────────────────────
let aheadTimer: ReturnType<typeof setTimeout> | null = null;

function aheadMargin(lifetimeMs: number): number {
  // A fifth of the lifetime, up to a minute: a 15-minute token refreshes at 14,
  // and a 1-minute test token at 48 seconds rather than immediately.
  return Math.min(REFRESH_AHEAD_MS, lifetimeMs * 0.2);
}

/** Is there a session whose timing this browser knows? False before the first login or refresh. */
export function hasSessionTiming(): boolean {
  return readNumber(LAST_REFRESH_KEY) !== null && readNumber(LIFETIME_KEY) !== null;
}

function scheduleRefreshAhead(delayOverrideMs?: number): void {
  if (aheadTimer) clearTimeout(aheadTimer);
  aheadTimer = null;

  const lifetime = readNumber(LIFETIME_KEY);
  const last = readNumber(LAST_REFRESH_KEY);
  if (!lifetime || !last) return;

  const due = last + lifetime - aheadMargin(lifetime);
  const delay = delayOverrideMs ?? Math.max(due - Date.now(), 1_000);

  aheadTimer = setTimeout(async () => {
    try {
      // Half a lifetime is the bar for "refreshed recently enough": another tab
      // may have done it while this one slept, and its time is the shared one.
      await refreshSession(lifetime * 0.5);
      scheduleRefreshAhead();
    } catch (error) {
      if (isAuthRejection(error)) {
        endSession();
        return;
      }
      // A dropped connection says nothing about the session. Try again shortly,
      // not every second.
      scheduleRefreshAhead(15_000);
    }
  }, delay);
}

// A tab that was hidden, or a laptop that slept, wakes up past its due time.
// Timers in a hidden tab are throttled, so re-evaluate when it is visible again.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasSessionTiming()) scheduleRefreshAhead();
  });
}

/**
 * Records that a fresh session just began: after login, or after a refresh.
 *
 * @param expiresInSeconds how long the access token lives, as the server reports it
 */
export function noteSession(expiresInSeconds?: number): void {
  writeNumber(LAST_REFRESH_KEY, Date.now());
  if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
    writeNumber(LIFETIME_KEY, expiresInSeconds * 1000);
  }
  scheduleRefreshAhead();
}

/** Forgets the session's timing and stops the ahead-of-expiry refresh. For logout and a dead session. */
export function forgetSession(): void {
  if (aheadTimer) clearTimeout(aheadTimer);
  aheadTimer = null;
  writeNumber(LAST_REFRESH_KEY, null);
  writeNumber(LIFETIME_KEY, null);
}

/**
 * Makes sure the session has comfortable time left, refreshing now if it does not.
 *
 * For the places that authenticate once and then hold a connection open: the
 * interview socket sends its cookies only in the handshake, so a reconnect has
 * to start from a fresh session or it is turned away.
 */
export async function ensureFreshSession(): Promise<void> {
  const lifetime = readNumber(LIFETIME_KEY);
  const last = readNumber(LAST_REFRESH_KEY);
  if (lifetime && last && Date.now() < last + lifetime - aheadMargin(lifetime)) return;
  try {
    await refreshSession();
  } catch (error) {
    if (isAuthRejection(error)) endSession();
    throw error;
  }
}

/**
 * After a page load that found a signed-in user but no record of when the session began.
 *
 * Without the timing the page cannot refresh ahead of expiry, so the first sign would be a request failing. One
 * refresh learns it. Best effort: a failure here is not worth interrupting the page for.
 */
export async function ensureSessionTiming(): Promise<void> {
  if (hasSessionTiming()) {
    scheduleRefreshAhead();
    return;
  }
  try {
    await refreshSession(0);
  } catch {
    // The reactive path (a 401, then a refresh) still covers it.
  }
}

/**
 * Did the server actually reject this session, or did the request just fail?
 *
 * Only a real 401/403 from the refresh endpoint means the session is gone. A
 * network drop, a timeout, a 5xx or a request aborted because the page is
 * unloading say nothing about the session, and tearing it down on those was
 * its own way of logging people out mid-reload.
 */
export function isAuthRejection(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

/** Tears the session down locally and tells the app and other tabs. The app then shows the login page. */
function endSession(): void {
  forgetSession();
  broadcastAuthChange("logout");
  dispatchErrorToast(getErrorMessage("AUTH_INVALID_REFRESH"));
  window.dispatchEvent(new CustomEvent("auth:forceLogout"));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const status = error.response?.status;

    // ── Normalize Blob error bodies ──────────────────────────────────
    // Requests with responseType: 'blob' (e.g. resume/file downloads) also
    // receive their *error* body as a Blob, so error.response.data has no
    // readable `code`/`message`. Parse it back to JSON (or text) here so the
    // real server error surfaces instead of a generic "Bad Request".
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text();
        try {
          error.response.data = JSON.parse(text);
        } catch {
          error.response.data = { message: text } as ApiErrorEnvelope;
        }
      } catch {
        // Blob unreadable — leave as-is and fall through to generic handling
      }
    }

    // ── 401 on a protected call: refresh once, retry once ────────────
    //
    // Only a 401 means "log in again". A 403 is a signed-in user without the
    // permission, and falls through to its own message below; it must never log
    // anyone out or start a refresh.
    if (status === 401 && originalRequest && !isPublicPath(originalRequest.url)) {
      // The retry itself came back 401: the fresh cookie did not help, so the
      // session is not valid. Stop here rather than refresh again, which is how
      // a loop would start.
      if (originalRequest._retry) {
        if (!originalRequest._silentAuth) endSession();
        return Promise.reject(error);
      }

      const errorCode = (error.response?.data as ApiErrorEnvelope | undefined)?.code;
      if (!errorCode || errorCode === "AUTH_INVALID_TOKEN" || errorCode === "AUTH_UNAUTHORIZED") {
        originalRequest._retry = true;

        try {
          // Shared with every other 401 and with the ahead-of-expiry refresh, so
          // the rotated cookie is only ever spent once.
          await refreshSession();
        } catch (refreshError) {
          // Only a rejected session ends the session. A refresh that failed
          // because the network blinked, or because the tab is reloading and the
          // request was aborted, leaves the login intact for the next attempt.
          if (isAuthRejection(refreshError) && !originalRequest._silentAuth) endSession();
          return Promise.reject(refreshError);
        }
        // The cookies are new; the browser attaches them. Nothing to copy over.
        return api(originalRequest);
      }
    }

    // ── Auto-toast for all other errors ──────────────────────────────
    if (!originalRequest?._skipErrorToast) {
      const data = error.response?.data as ApiErrorEnvelope | undefined;
      const hasStructuredError = !!data?.code || typeof data?.message === "string";
      if (hasStructuredError || status === 403 || status === 429) {
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
  /**
   * The server's own wording, before it was mapped to our copy.
   *
   * Needed where one error code covers several causes and only the server can
   * say which — a duplicate registration is USER_ALREADY_EXISTS whether the
   * email or the mobile number clashed, and the mapped message cannot name
   * either without being wrong half the time.
   */
  serverMessage?: string;
  /**
   * The HTTP status, or undefined when the request never reached a server.
   *
   * The absence is as meaningful as the value: a retry decision turns on
   * whether a second attempt could plausibly do better, and "the connection
   * dropped" and "the server said 413" point opposite ways.
   */
  status?: number;
} {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorEnvelope | undefined;
    const status = error.response?.status;

    // Statuses with a meaning of their own, ahead of whatever code the server sent.
    //  - 429: login and one-time codes are rate limited; the answer is to wait.
    //  - 403 on code execution: the account lacks the run permission. Said so,
    //    because "something went wrong" sends a candidate to debug code that is fine.
    if (status === 429) {
      return { code: "RATE_LIMITED", message: getErrorMessage("RATE_LIMITED"), serverMessage: data?.message, status };
    }
    if (status === 403 && isCompilePath(error.config?.url)) {
      return {
        code: "COMPILER_FORBIDDEN",
        message: getErrorMessage("COMPILER_FORBIDDEN"),
        serverMessage: data?.message,
        status,
      };
    }

    // V2 format: flat object with code field
    if (data?.code) {
      return {
        code: data.code,
        message: getErrorMessage(data.code, data.message),
        serverMessage: data.message,
        status,
      };
    }
    // A bare 403 is a missing permission, and is said as one.
    if (status === 403) {
      return { code: "AUTH_FORBIDDEN", message: getErrorMessage("AUTH_FORBIDDEN"), status };
    }
    // Legacy format: { message, timestamp } — no code
    if (data && typeof data.message === "string") {
      return {
        code: `HTTP_${status}`,
        message: data.message,
        status,
      };
    }
    if (error.code === "ECONNABORTED") {
      return {
        code: "TIMEOUT_ERROR",
        message: getErrorMessage("TIMEOUT_ERROR"),
        status,
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
      status,
    };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : getErrorMessage(),
  };
}

export default api;
