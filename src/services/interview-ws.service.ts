import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { ensureFreshSession, isAuthRejection } from "./api.service";

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
  /** Who and what this connection is for: the schedule, the email and the phone's pairing token. */
  private connectionParams: URLSearchParams = new URLSearchParams();

  /** Pass null on teardown, so a dead component stops receiving socket errors. */
  /**
   * This connection's URL. It carries no credential: the session is an HttpOnly cookie, which the browser sends
   * on the handshake by itself. (`mobileToken` is the phone's pairing token, not a login.)
   */
  private buildUrl(): string {
    const query = this.connectionParams.toString();
    return `${WS_BASE_URL}/ws${query ? `?${query}` : ""}`;
  }

  setErrorCallback(cb: ((error: string) => void) | null) {
    this.errorCallback = cb;
  }

  connect(options: {
    scheduleId?: number;
    email?: string;
    mobileToken?: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    /** Called on each drop, so the UI can hold the count in state. */
    onReconnectAttempt?: (attempt: number) => void;
  }) {
    const { scheduleId, email, mobileToken, onConnect, onDisconnect, onReconnectAttempt } = options;

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
    console.log("Connecting to WebSocket. ScheduleId:", scheduleId);

    this.client = new Client({
      webSocketFactory: () => new SockJS(this.buildUrl()),
      // Runs before the first connect and before every retry. The socket is
      // authenticated once, by the cookie on the handshake, and the access token
      // lasts minutes while an interview runs for an hour. A retry that reused
      // an expired cookie was turned away, and the candidate sat under
      // "Connection lost. Reconnecting..." that could never succeed. So each
      // attempt starts by making sure the session is fresh. A session the
      // server has rejected sends the user to login, and stops the retries.
      beforeConnect: async () => {
        try {
          await ensureFreshSession();
        } catch (error) {
          console.error("Could not refresh the session before connecting the socket", error);
          if (isAuthRejection(error)) {
            await this.client?.deactivate();
          }
        }
      },
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
