import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { getAccessToken, refreshAccessToken } from "./api.service";
import { isJwtExpired } from "@/utils/jwt.utils";

/**
 * Where SockJS should dial for the interview socket.
 *
 * The STOMP endpoint `/ws` is registered on the main application server, so this
 * is always the same origin as the REST API — never a different port. That is
 * why the fallback derives from `VITE_API_BASE_URL` rather than guessing a port
 * number: the previous version hardcoded 8082, which is the stage port, so a dev
 * machine dialled a port with nothing behind it and every interview opened on
 * "Connection lost. Reconnecting..." with no first question.
 */
const getWsBaseUrl = () => {
  // SockJS speaks http/https; ws/wss is the raw-WebSocket spelling and it
  // rejects those outright.
  const toHttp = (value: string) =>
    value.trim().replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");

  const explicit = import.meta.env.VITE_WS_BASE_URL;
  if (explicit) {
    return toHttp(explicit);
  }

  // Same server as the API, by construction.
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) {
    return toHttp(apiBase);
  }

  // Served from the backend itself (production build behind one origin).
  return `${window.location.protocol}//${window.location.host}`;
};

const WS_BASE_URL = getWsBaseUrl();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubscriptionCallback = (message: any) => void;

class InterviewWsService {
  private client: Client | null = null;
  private subscriptions: Map<
    string,
    { unsubscribe: () => void; callback: SubscriptionCallback }
  > = new Map();
  /** Milliseconds stompjs waits before each retry. 0 would disable retrying. */
  private reconnectDelay = 2000;
  private errorCallback: ((error: string) => void) | null = null;
  /**
   * How many times the socket has dropped since it was last up.
   *
   * stompjs owns the retry loop itself (see {@link reconnectDelay}); this only
   * counts the drops so the candidate's banner can say something true. It used
   * to be reset on connect and never incremented anywhere, so the banner always
   * read "attempt 0" however long the socket had been down.
   */
  public currentReconnectAttempts = 0;
  /**
   * Who we are connected as — scheduleId, email, mobileToken.
   *
   * Deliberately excludes the JWT. It used to be part of this string, so a
   * token refresh looked like a different connection and tore down a perfectly
   * healthy socket.
   */
  private currentParams: string = "";
  /** The non-credential half of the query, kept so each attempt can re-sign. */
  private connectionParams: URLSearchParams = new URLSearchParams();
  /**
   * A token handed in by the caller, used until it expires.
   *
   * Cleared on expiry so later attempts fall back to the app's current token
   * rather than pinning a stale one for the life of the connection.
   */
  private explicitToken: string | undefined;

  /** Pass null on teardown, so a dead component stops receiving socket errors. */
  /**
   * This connection's URL, signed with the token available right now.
   *
   * SockJS keeps the query string when it appends its transport path, so
   * `/ws?token=…` becomes `/ws/{server}/{session}/websocket?token=…` and the
   * credential survives to the handshake.
   */
  private buildUrl(): string {
    const params = new URLSearchParams(this.connectionParams);

    const jwt =
      this.explicitToken || getAccessToken() || localStorage.getItem("accessToken");
    if (jwt) {
      // Four spellings because the server has read different ones over time;
      // the interceptor looks for `token`.
      for (const key of ["token", "accessToken", "jwt", "access_token"]) {
        params.append(key, jwt);
      }
    }

    const query = params.toString();
    return `${WS_BASE_URL}/ws${query ? `?${query}` : ""}`;
  }

  setErrorCallback(cb: ((error: string) => void) | null) {
    this.errorCallback = cb;
  }

  connect(options: {
    scheduleId?: number;
    token?: string;
    email?: string;
    mobileToken?: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    /** Called on each drop, so the UI can hold the count in state. */
    onReconnectAttempt?: (attempt: number) => void;
  }) {
    const { scheduleId, token, email, mobileToken, onConnect, onDisconnect, onReconnectAttempt } =
      options;

    const params = new URLSearchParams();
    if (scheduleId) params.append("scheduleId", scheduleId.toString());
    if (email) params.append("email", email);
    if (mobileToken) params.append("mobileToken", mobileToken);

    const paramsStr = params.toString();

    if (
      this.client &&
      this.client.connected &&
      this.currentParams === paramsStr
    ) {
      if (onConnect) onConnect();
      return;
    }

    if (this.client) {
      this.disconnect();
    }

    this.currentParams = paramsStr;
    this.connectionParams = params;
    this.currentReconnectAttempts = 0;
    this.explicitToken = token;
    console.log("Connecting to WebSocket. ScheduleId:", scheduleId);

    this.client = new Client({
      // Built per attempt, not once. The handshake is authenticated by a JWT in
      // the query string, and access tokens live 10 minutes while an interview
      // runs for an hour — so a URL captured at connect time carries a
      // credential that expires mid-session. Every stompjs retry then replayed
      // the same dead token, the handshake answered 401, and the candidate sat
      // under "Connection lost. Reconnecting..." that could never succeed.
      webSocketFactory: () => new SockJS(this.buildUrl()),
      // Left empty on purpose: the browser cannot set headers on a WebSocket
      // upgrade, so these never reached the server. The query string above is
      // what the handshake interceptor actually reads.
      connectHeaders: {},
      reconnectDelay: this.reconnectDelay,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log("STOMP connected successfully");
        this.currentReconnectAttempts = 0;
        if (onConnect) onConnect();
      },
      onDisconnect: () => {
        console.log("STOMP disconnected");
        if (onDisconnect) onDisconnect();
      },
      onWebSocketClose: () => {
        // stompjs retries on its own; this is the only hook that fires per drop,
        // so it is where the count has to come from.
        this.currentReconnectAttempts += 1;
        console.warn("WebSocket closed; retry", this.currentReconnectAttempts);
        if (onReconnectAttempt) onReconnectAttempt(this.currentReconnectAttempts);

        // An expired access token is the one cause retrying cannot fix on its
        // own, so spend the refresh cookie now and let the next attempt — two
        // seconds later — sign itself with the new token. refreshAccessToken
        // de-duplicates concurrent callers and no-ops while the token is still
        // valid, so this is safe to call on every drop.
        const current = this.explicitToken || getAccessToken();
        if (!current || isJwtExpired(current)) {
          this.explicitToken = undefined;
          refreshAccessToken().catch((err) => {
            console.error("Could not refresh the access token for the socket", err);
          });
        }

        if (onDisconnect) onDisconnect();
      },
      onStompError: (frame) => {
        console.error("STOMP error", frame);
        if (this.errorCallback) {
          this.errorCallback(frame.headers["message"] || "STOMP error");
        }
      },
      onWebSocketError: (event) => {
        console.error("WebSocket error", event);
        if (this.errorCallback) {
          this.errorCallback("WebSocket connection error");
        }
      },
    });

    this.client.activate();
  }

  // Legacy method for backward compatibility (optional)
  connectLegacy(
    scheduleId: number,
    onConnect?: () => void,
    onDisconnect?: () => void,
  ) {
    this.connect({ scheduleId, onConnect, onDisconnect });
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this.subscriptions.clear();
  }

  send(destination: string, body: unknown, headers: Record<string, string> = {}) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected");
      return;
    }
    this.client.publish({
      destination,
      body: JSON.stringify(body),
      headers,
    });
  }

  subscribe(destination: string, callback: SubscriptionCallback) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected, cannot subscribe");
      return;
    }
    const subscription = this.client.subscribe(destination, (message) => {
      try {
        const parsed = JSON.parse(message.body);
        callback(parsed);
      } catch {
        callback(message.body);
      }
    });
    this.subscriptions.set(destination, {
      unsubscribe: () => subscription.unsubscribe(),
      callback,
    });
  }

  unsubscribe(destination: string) {
    const sub = this.subscriptions.get(destination);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(destination);
    }
  }

  get connected() {
    return this.client !== null && this.client.connected;
  }

  sendBinary(destination: string, buffer: ArrayBuffer) {
    if (!this.client || !this.client.connected) {
      console.error("WebSocket not connected");
      return;
    }
    // STOMP allows sending binary data as the body
    this.client.publish({
      destination,
      binaryBody: new Uint8Array(buffer),
    });
  }
}

export const interviewWsService = new InterviewWsService();
